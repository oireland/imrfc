// Property-based tests for the Portion and ledger rules: random sequences of Moves and Quantity changes, each
// checked against a deliberately simple model (a map from Place to count). The rules must accept
// exactly what the model says is possible, end up exactly where the model does, and never lose or
// invent equipment.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  HOME,
  add,
  allAt,
  canTake,
  countAt,
  key,
  modelPairs,
  modelTotal,
  moveMany,
  placeArb,
  placeOf,
  resolveSource,
  sourceArb,
  portionPairs,
  problemsWith,
  shift,
  splitAcross,
  splitArb,
  type Model,
  type SourceChoice,
} from "@/test/whereabouts-model";
import { lowerQuantity, moveMultiple, toPlace, totalQuantity, type Place, type Portion } from "./portions";
import { applyEntry, replay } from "./ledger";

const count = fc.integer({ min: 1, max: 6 });

type Op =
  | { kind: "move"; from: SourceChoice; to: Place; count: number }
  | { kind: "moveAll"; to: Place }
  | { kind: "split"; sources: { from: SourceChoice; count: number }[]; targets: Place[]; cuts: number[]; skew: number }
  | { kind: "raise"; count: number }
  | { kind: "lower"; count: number; from: SourceChoice | undefined };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant("move" as const), from: sourceArb, to: placeArb, count }),
  fc.record({ kind: fc.constant("moveAll" as const), to: placeArb }),
  fc
    .tuple(splitArb, fc.array(placeArb, { minLength: 1, maxLength: 3 }))
    .map(([s, targets]) => ({ kind: "split" as const, ...s, targets })),
  fc.record({ kind: fc.constant("raise" as const), count }),
  fc.record({ kind: fc.constant("lower" as const), count, from: fc.option(sourceArb, { nil: undefined }) }),
);

type Step = { ok: true; portions: Portion[] } | { ok: false; error: string };

/** Runs one operation through the rules, and works out from the model alone what should happen. */
function apply(portions: Portion[], model: Model, o: Op): { result: Step; expected: Model | "rejected" } {
  switch (o.kind) {
    case "move": {
      const from = resolveSource(model, o.from);
      const result = applyEntry(portions, { kind: "move", count: o.count, from, to: o.to });
      return { result, expected: o.count <= countAt(model, from) ? shift(model, from, o.to, o.count) : "rejected" };
    }
    case "moveAll": {
      // One entry for each Place it's at, as recordMove logs a whole-Quantity Move.
      let result: Step = { ok: true, portions };
      for (const p of portions) if (result.ok) result = applyEntry(result.portions, { kind: "move", count: p.count, from: toPlace(p), to: o.to });
      return { result, expected: allAt(o.to, modelTotal(model)) };
    }
    case "split": {
      const sources = o.sources.map((s) => ({ from: resolveSource(model, s.from), count: s.count }));
      const sum = sources.reduce((s, x) => s + x.count, 0);
      const targets = splitAcross(Math.max(0, sum + o.skew), o.targets, o.cuts);
      const result = moveMultiple(portions, { sources, targets });
      const balanced = targets.reduce((s, t) => s + t.count, 0) === sum;
      return { result, expected: balanced && canTake(model, sources) ? moveMany(model, sources, targets) : "rejected" };
    }
    case "raise":
      return {
        result: applyEntry(portions, { kind: "bought", count: o.count, to: { type: "store", storeId: HOME } }),
        expected: add(model, { type: "store", storeId: HOME }, o.count),
      };
    case "lower": {
      const from = o.from && resolveSource(model, o.from);
      const result = lowerQuantity(portions, { removeCount: o.count, from });
      const where = from ?? (model.size === 1 ? placeOf([...model.keys()][0]) : undefined);
      const possible = modelTotal(model) - o.count >= 1 && where !== undefined && o.count <= countAt(model, where);
      return { result, expected: possible ? add(model, where, -o.count) : "rejected" };
    }
  }
}

/** An Equipment Unit with `quantity`, all at Home. */
function start(quantity: number): Portion[] {
  const added = replay("shields", [{ kind: "added", count: quantity, to: { type: "store", storeId: HOME } }]);
  if (!added.ok) throw new Error(added.error);
  return added.portions;
}

describe("Portion rules under random sequences of Moves and Quantity changes", () => {
  it("accept exactly what's possible, match the model, and never lose or invent equipment", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.array(op, { minLength: 5, maxLength: 40 }), (quantity, ops) => {
        let portions = start(quantity);
        let model: Model = new Map([[key({ type: "store", storeId: HOME }), quantity]]);
        let expectedTotal = quantity;

        for (const o of ops) {
          const { result, expected } = apply(portions, model, o);
          if (expected === "rejected") {
            expect(result.ok, `${JSON.stringify(o)} should be rejected`).toBe(false);
            continue;
          }
          expect(result.ok, `${JSON.stringify(o)} should be accepted`).toBe(true);
          if (!result.ok) return;

          portions = result.portions;
          model = expected;
          if (o.kind === "raise") expectedTotal += o.count;
          if (o.kind === "lower") expectedTotal -= o.count;

          expect(portionPairs(portions)).toEqual(modelPairs(model));
          expect(totalQuantity(portions)).toBe(expectedTotal);
          expect(problemsWith(portions)).toEqual([]);
        }
      }),
      { numRuns: 500 },
    );
  });
});
