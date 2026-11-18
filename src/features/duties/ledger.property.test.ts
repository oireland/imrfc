// Property-based tests for the equipment ledger through its public entry points, against a real
// (PGlite) Postgres with the ledger's constraints: random sequences of Moves, split Moves, Unconfirmed,
// Quantity changes and Duty Confirms. After every step the database must match the model, its
// Quantity must equal what's actually anywhere, and nothing may be lost or invented.
//
// Replaying the Movement Log from nothing must also give the same Portions after every step.
//
// Not covered here: concurrency (PGlite has one connection; see the real-Postgres locking test).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import {
  EVENTS,
  HOLDERS,
  HOME,
  OTHER_STORE,
  add,
  allAt,
  canTake,
  countAt,
  key,
  modelPairs,
  modelTotal,
  moveMany,
  moveTargetArb,
  resolveSource,
  sourceArb,
  placeOf,
  portionPairs,
  problemsWith,
  shift,
  splitAcross,
  splitArb,
  type Model,
  type SourceChoice,
} from "@/test/whereabouts-model";
import { addToChecklist } from "@/features/checklists";
import { event } from "@/features/events";
import { store } from "@/features/stores";
import { user } from "@/features/users";
import {
  createEquipmentUnit,
  getEquipmentUnit,
  loadPortions,
  lowerQuantity,
  raiseQuantity,
  recordMove,
  recordSplitMove,
  replayWhereabouts,
  sameWhereabouts,
  setQuantity,
  setUnconfirmed,
  type MoveTarget,
  type Place,
} from "@/features/equipment";
import { claim, ensureDuties } from "@/test/duties";
import { confirmDuty } from "./index";

type Op =
  | { kind: "move"; from: SourceChoice; to: MoveTarget; count: number | undefined }
  | { kind: "split"; sources: { from: SourceChoice; count: number }[]; targets: MoveTarget[]; cuts: number[]; skew: number }
  | { kind: "unconfirmed"; eventId: string; from: SourceChoice | undefined; count: number | undefined }
  | { kind: "raise"; count: number }
  | { kind: "lower"; count: number; from: SourceChoice | undefined }
  | { kind: "setQuantity"; quantity: number; from: SourceChoice | undefined }
  | { kind: "confirmTo"; people: string[]; count: number }
  | { kind: "confirmFrom"; which: number };

const count = fc.integer({ min: 1, max: 6 });
const maybeSource = fc.option(sourceArb, { nil: undefined });

const op: fc.Arbitrary<Op> = fc.oneof(
  // No count means everything at `from`.
  fc.record({ kind: fc.constant("move" as const), from: sourceArb, to: moveTargetArb, count: fc.option(count, { nil: undefined }) }),
  fc
    .tuple(splitArb, fc.array(moveTargetArb, { minLength: 1, maxLength: 3 }))
    .map(([s, targets]) => ({ kind: "split" as const, ...s, targets })),
  fc.record({
    kind: fc.constant("unconfirmed" as const),
    eventId: fc.constantFrom(...EVENTS),
    from: maybeSource,
    count: fc.option(count, { nil: undefined }),
  }),
  fc.record({ kind: fc.constant("raise" as const), count }),
  fc.record({ kind: fc.constant("lower" as const), count, from: maybeSource }),
  fc.record({ kind: fc.constant("setQuantity" as const), quantity: fc.integer({ min: 0, max: 14 }), from: maybeSource }),
  // A new Event's To Duty, Confirmed now; its From Duty waits to be Confirmed by a later step.
  fc.record({ kind: fc.constant("confirmTo" as const), people: fc.shuffledSubarray([...HOLDERS], { minLength: 1, maxLength: 2 }), count }),
  fc.record({ kind: fc.constant("confirmFrom" as const), which: fc.nat(5) }),
);

const PAST = { eventType: "training" as const, start: new Date("2020-01-01T10:00:00Z"), end: new Date("2020-01-01T11:00:00Z"), venue: "x", cancelled: true };

/** One database for every run (migrating one per run is most of the cost); each run gets its own Equipment Unit. */
async function setup() {
  const db = await createTestDb();
  await db.insert(user).values(HOLDERS.map((id) => ({ id, name: id, email: `${id}@example.com`, accessState: "approved" as const })));
  await db.insert(store).values([HOME, OTHER_STORE].map((id) => ({ id, name: id, address: "x" })));
  // Past and Cancelled, so nothing else (warnings, heads-ups) reacts to them.
  await db.insert(event).values(EVENTS.map((id) => ({ id, title: id, ...PAST })));
  return db;
}

type Db = Awaited<ReturnType<typeof setup>>;

async function newUnit(db: Db, quantity: number): Promise<string> {
  const made = await createEquipmentUnit(db, { name: "Tackle shields", homeId: HOME, quantity });
  if (!made.ok) throw new Error(made.error);
  return made.equipmentUnit.id;
}

async function whereabouts(db: Db, unitId: string): Promise<Model> {
  return new Map(portionPairs(await loadPortions(db, unitId)));
}

type PendingFrom = { dutyId: string; people: string[]; count: number };

/** Creates an Event whose Checklist asks for `count`, and puts `people` on its To Duty (the From Duty follows). */
async function newDuties(db: Db, unitId: string, people: string[], count: number) {
  const eventId = crypto.randomUUID();
  await db.insert(event).values({ id: eventId, title: eventId, ...PAST });
  const listed = await addToChecklist(db, { scope: "event", scopeId: eventId }, unitId, count);
  if (!listed.ok) throw new Error(listed.error);
  const duties = await ensureDuties(db, eventId, [unitId]);
  const to = duties.find((d) => d.direction === "to")!;
  const from = duties.find((d) => d.direction === "from")!;
  for (const person of people) await claim(db, to.id, person);
  return { toId: to.id, fromId: from.id };
}

const asMember = (id: string) => ({ id, role: "member" as const });
const holder = (holderId: string) => ({ type: "holder" as const, holderId });

describe("The equipment ledger under random sequences of changes", () => {
  it("matches the model after every step, keeps Quantity equal to what's anywhere, and never loses or invents equipment", async () => {
    const db = await setup();
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), fc.array(op, { minLength: 5, maxLength: 25 }), async (startQuantity, ops) => {
        const unitId = await newUnit(db, startQuantity);
        let model: Model = allAt({ type: "store", storeId: HOME }, startQuantity);
        const pendingFroms: PendingFrom[] = [];

        for (const o of ops) {
          const step = JSON.stringify(o);
          switch (o.kind) {
            case "move": {
              const from = resolveSource(model, o.from);
              const result = await recordMove(db, unitId, "sam", o.to, "ad_hoc", { from, count: o.count });
              const moving = o.count ?? countAt(model, from);
              const possible = moving >= 1 && moving <= countAt(model, from);
              expect(result.ok, step).toBe(possible);
              if (possible) model = shift(model, from, o.to, moving);
              break;
            }
            case "split": {
              const sources = o.sources.map((s) => ({ from: resolveSource(model, s.from), count: s.count }));
              const sum = sources.reduce((s, x) => s + x.count, 0);
              const targets = splitAcross(Math.max(0, sum + o.skew), o.targets, o.cuts);
              const result = await recordSplitMove(db, unitId, "sam", "ad_hoc", { sources, targets });
              const possible = targets.reduce((s, t) => s + t.count, 0) === sum && canTake(model, sources);
              expect(result.ok, step).toBe(possible);
              if (possible) model = moveMany(model, sources, targets);
              break;
            }
            case "unconfirmed": {
              const from = o.from && resolveSource(model, o.from);
              await setUnconfirmed(db, unitId, o.eventId, from, o.count);
              const lastSeen: Place = { type: "unconfirmed", lastSeenEventId: o.eventId };
              if (!from) model = allAt(lastSeen, modelTotal(model));
              else {
                const moving = Math.min(o.count ?? Infinity, countAt(model, from));
                if (moving >= 1) model = shift(model, from, lastSeen, moving);
              }
              break;
            }
            case "raise": {
              expect((await raiseQuantity(db, unitId, "sam", o.count)).ok, step).toBe(true);
              model = add(model, { type: "store", storeId: HOME }, o.count);
              break;
            }
            case "lower":
            case "setQuantity": {
              const current = modelTotal(model);
              const from = o.from && resolveSource(model, o.from);
              const removing = o.kind === "lower" ? o.count : current - o.quantity;
              const result =
                o.kind === "lower" ? await lowerQuantity(db, unitId, "sam", o.count, from) : await setQuantity(db, unitId, "sam", o.quantity, from);
              if (o.kind === "setQuantity" && o.quantity < 1) {
                expect(result.ok, step).toBe(false);
              } else if (removing < 0) {
                expect(result.ok, step).toBe(true);
                model = add(model, { type: "store", storeId: HOME }, -removing);
              } else if (removing > 0) {
                const where = from ?? (model.size === 1 ? placeOf([...model.keys()][0]) : undefined);
                const possible = current - removing >= 1 && where !== undefined && removing <= countAt(model, where);
                expect(result.ok, step).toBe(possible);
                if (possible) model = add(model, where, -removing);
              }
              break;
            }
            case "confirmTo": {
              const total = modelTotal(model);
              // The Checklist can't ask for more than the Quantity.
              const count = Math.min(o.count, total);
              const { toId, fromId } = await newDuties(db, unitId, o.people, count);
              const confirmer = holder(o.people[0]);

              expect(await confirmDuty(db, toId, asMember(o.people[0])), step).toEqual({ ok: true });
              const after = await whereabouts(db, unitId);
              // Whatever they already had counts towards the Duty; the rest is gathered from elsewhere.
              expect(countAt(after, confirmer), `${step}: confirmer`).toBe(Math.max(countAt(model, confirmer), count));
              for (const [k, n] of after) if (k !== key(confirmer)) expect(n, `${step}: ${k} gained`).toBeLessThanOrEqual(model.get(k) ?? 0);
              expect(modelTotal(after), `${step}: total`).toBe(total);
              model = after;
              pendingFroms.push({ dutyId: fromId, people: o.people, count });
              break;
            }
            case "confirmFrom": {
              if (pendingFroms.length === 0) break;
              const [pending] = pendingFroms.splice(o.which % pendingFroms.length, 1);
              const total = modelTotal(model);
              // The Checklist's count, capped at the Quantity now.
              const count = Math.min(pending.count, total);
              const peopleHave = pending.people.reduce((sum, p) => sum + countAt(model, holder(p)), 0);
              const notWithAnyone = [...model].filter(([k]) => !k.startsWith("holder:")).reduce((sum, [, n]) => sum + n, 0);
              const result = await confirmDuty(db, pending.dutyId, asMember(pending.people[0]));
              // It comes from the Duty's People, then anywhere that isn't someone else; never from another Holder.
              const possible = peopleHave + notWithAnyone >= count;
              expect(result.ok, `${step}: ${JSON.stringify({ count, peopleHave, notWithAnyone })}`).toBe(possible);
              if (!possible) break;

              const after = await whereabouts(db, unitId);
              const confirmerHad = countAt(model, holder(pending.people[0]));
              expect(countAt(after, holder(pending.people[0])), `${step}: confirmer`).toBe(confirmerHad - Math.min(confirmerHad, count));
              for (const holderId of HOLDERS.filter((h) => !pending.people.includes(h))) {
                expect(countAt(after, holder(holderId)), `${step}: ${holderId} isn't on this Duty`).toBe(countAt(model, holder(holderId)));
              }
              expect(modelTotal(after), `${step}: total`).toBe(total);
              model = after;
              break;
            }
          }

          const portions = await loadPortions(db, unitId);
          expect(portionPairs(portions), `after ${step}`).toEqual(modelPairs(model));
          expect(problemsWith(portions), `after ${step}`).toEqual([]);
          const replayed = await replayWhereabouts(db, unitId);
          expect(replayed.ok && sameWhereabouts(replayed.portions, portions), `replay after ${step}`).toBe(true);
          expect((await getEquipmentUnit(db, unitId))?.quantity, `Quantity after ${step}`).toBe(modelTotal(model));
        }
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
