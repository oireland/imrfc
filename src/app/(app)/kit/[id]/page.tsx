import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BackLink } from "@/components/back-link";
import { SubmitButton } from "@/components/submit-button";
import { ClashList } from "@/components/clash-list";
import { HeadsUpList } from "@/components/heads-up-list";
import { formatWhen } from "@/lib/format-time";
import { listClashes, listHeadsUps } from "@/features/duties";
import {
  describeWhereabouts,
  getKitUnit,
  getPortions,
  listMovementLog,
  lowerQuantity,
  quickMoveFor,
  raiseQuantity,
  recordMove,
  type MovementLogEntry,
  type Place,
  type Portion,
} from "@/features/kit";
import { getEvent } from "@/features/events";
import { displayName, isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { listStores, type Store } from "@/features/stores";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-[22px] leading-tight";

/** A Portion's Place as a form field value: "store:<id>", "holder:<id>", or "unconfirmed:<id>". */
function placeValue(portion: Portion): string {
  if (portion.whereaboutsType === "store") return `store:${portion.storeId}`;
  if (portion.whereaboutsType === "holder") return `holder:${portion.holderId}`;
  return `unconfirmed:${portion.lastSeenEventId}`;
}

function parsePlace(value: string): Place {
  const [type, id] = value.split(":");
  if (type === "store") return { type: "store", storeId: id };
  if (type === "holder") return { type: "holder", holderId: id };
  return { type: "unconfirmed", lastSeenEventId: id };
}

export default async function KitUnitDetailPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const found = await getKitUnit(db, id);
  if (!found) notFound();
  const unit = found;

  const [stores, portions, log, allClashes, allHeadsUps, people] = await Promise.all([
    listStores(db),
    getPortions(db, id),
    listMovementLog(db, id),
    listClashes(db),
    listHeadsUps(db),
    listApprovedUsers(db),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const personName = (personId: string | null) => {
    if (personId === user.id) return "you";
    const person = personId ? personById.get(personId) : undefined;
    return person ? displayName(person) : "someone";
  };
  const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const eventNames = new Map<string, string>();
  for (const eventId of new Set(portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])))) {
    eventNames.set(eventId, (await getEvent(db, eventId))?.title ?? "an event");
  }
  const clashes = allClashes.filter((c) => c.kitUnitId === id);
  const headsUps = allHeadsUps.filter((h) => h.kitUnitId === id);
  const storesById = new Map(stores.map((s: Store) => [s.id, s]));
  const storeName = (storeId: string | null) => (storeId && storesById.get(storeId)?.name) || "a store";
  const whereaboutsLabel = describeWhereabouts(portions, {
    storeName,
    personName,
    eventName: (eventId) => eventNames.get(eventId) ?? "an event",
  });
  const split = unit.quantity > 1;
  const committee = isCommitteeOrAbove(user.role);

  /** One Movement Log entry as a sentence: "You put it in the Shed", "Tom gave it to Priya". */
  function historyLine(entry: MovementLogEntry): string {
    const who = capitalised(personName(entry.userId));
    if (entry.kind === "condition_note") return `${who} noted: “${entry.conditionNote}”`;
    if (entry.conditionNote?.startsWith("Bought ") || entry.conditionNote?.startsWith("Lost ")) {
      return `${who} ${entry.conditionNote.startsWith("Bought") ? "bought" : "lost"} ${entry.count}`;
    }
    const word = split && entry.count ? String(entry.count) : "it";
    const where =
      entry.toType === "store" ? `in ${storeName(entry.toStoreId)}` : `with ${personName(entry.toHolderId)}`;
    if (entry.reason === "duty") {
      if (entry.toType === "store") return `${who} put ${word} back ${where} (duty done)`;
      if (entry.toHolderId === entry.userId) return `${who} brought ${word} along (duty done)`;
      return `${who} confirmed ${word === "it" ? "it's" : `${word} is`} ${where} (duty done)`;
    }
    if (entry.toType === "store") return `${who} put ${word} ${where}`;
    if (entry.toHolderId === entry.userId) return `${who} took ${word}`;
    return `${who} gave ${word} to ${personName(entry.toHolderId)}`;
  }

  async function quickMove(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const portionId = String(formData.get("portionId"));
    const [current, currentPortions] = await Promise.all([getKitUnit(db, id), getPortions(db, id)]);
    const portion = currentPortions.find((p) => p.id === portionId) ?? currentPortions[0];
    if (!current || !portion) return;
    const move = quickMoveFor({ unit: current, portion }, userId);
    await recordMove(db, id, userId, move.to, "ad_hoc", { count: move.count, from: move.from });
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function giveTo(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const holderId = String(formData.get("holderId"));
    const from = parsePlace(String(formData.get("from")));
    const count = Number(formData.get("count"));
    const recipient = (await listApprovedUsers(db)).find((p) => p.id === holderId && p.accessState === "approved");
    if (!recipient || !count) return;
    await recordMove(db, id, userId, { type: "holder", holderId }, "ad_hoc", { count, from });
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function putInStore(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const from = parsePlace(String(formData.get("from")));
    const count = Number(formData.get("count"));
    if (!count) return;
    await recordMove(db, id, userId, { type: "store", storeId: String(formData.get("storeId")) }, "ad_hoc", {
      count,
      from,
    });
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function bought(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    if (!isCommitteeOrAbove((await requireApprovedUser()).role)) return;
    const addCount = Number(formData.get("addCount"));
    if (!addCount) return;
    await raiseQuantity(db, id, userId, addCount);
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function lost(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    if (!isCommitteeOrAbove((await requireApprovedUser()).role)) return;
    const removeCount = Number(formData.get("removeCount"));
    const fromValue = String(formData.get("from") ?? "");
    if (!removeCount) return;
    await lowerQuantity(db, id, userId, removeCount, fromValue ? parsePlace(fromValue) : undefined);
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  function PortionActions({ portion }: { portion: Portion }) {
    const move = quickMoveFor({ unit, portion }, user.id);
    const giveable = people.filter(
      (p) => p.accessState === "approved" && p.id !== user.id && !(portion.whereaboutsType === "holder" && p.id === portion.holderId),
    );
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
        <p className="text-sm font-medium">
          {split ? `${portion.count} ` : ""}
          {portion.whereaboutsType === "store"
            ? `in ${storeName(portion.storeId)}`
            : portion.whereaboutsType === "holder"
              ? `with ${personName(portion.holderId)}`
              : `not confirmed — last seen at ${eventNames.get(portion.lastSeenEventId ?? "") ?? "an event"}`}
        </p>

        <form action={quickMove}>
          <input type="hidden" name="portionId" value={portion.id} />
          <SubmitButton size="lg" className="h-11 w-full" variant={move.to.type === "holder" ? "default" : "outline"}>
            {move.to.type === "holder" ? "I've got it" : `Return to ${storeName(move.to.storeId)}`}
          </SubmitButton>
        </form>

        {giveable.length > 0 && (
          <form action={giveTo} className="flex flex-col gap-1.5">
            <input type="hidden" name="from" value={placeValue(portion)} />
            <label htmlFor={`give-to-${portion.id}`} className="text-xs text-muted-foreground">
              Or give it to someone
            </label>
            <div className="flex gap-2">
              <NativeSelect id={`give-to-${portion.id}`} name="holderId" className="flex-1" defaultValue="" required>
                <NativeSelectOption value="" disabled>
                  Choose a person…
                </NativeSelectOption>
                {giveable.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {displayName(p)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {split && (
                <input
                  type="number"
                  name="count"
                  min={1}
                  max={portion.count}
                  defaultValue={portion.count}
                  aria-label="How many"
                  className="w-16 rounded-md border border-border bg-transparent px-2 text-sm"
                />
              )}
              {!split && <input type="hidden" name="count" value={portion.count} />}
              <SubmitButton variant="secondary">Give</SubmitButton>
            </div>
          </form>
        )}

        <form action={putInStore} className="flex flex-col gap-1.5">
          <input type="hidden" name="from" value={placeValue(portion)} />
          <label htmlFor={`put-in-store-${portion.id}`} className="text-xs text-muted-foreground">
            Or put it away in
          </label>
          <div className="flex gap-2">
            <NativeSelect id={`put-in-store-${portion.id}`} name="storeId" className="flex-1" defaultValue={unit.homeId}>
              {stores.map((s: Store) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {split && (
              <input
                type="number"
                name="count"
                min={1}
                max={portion.count}
                defaultValue={portion.count}
                aria-label="How many"
                className="w-16 rounded-md border border-border bg-transparent px-2 text-sm"
              />
            )}
            {!split && <input type="hidden" name="count" value={portion.count} />}
            <SubmitButton variant="secondary">Put away</SubmitButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/kit">Kit</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">
          {unit.name}
          {split && <span className="text-muted-foreground"> ×{unit.quantity}</span>}
        </h2>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Now</dt>
            <dd className="font-medium">{whereaboutsLabel}</dd>
            <dt className="text-muted-foreground">Home</dt>
            <dd>{storeName(unit.homeId)}</dd>
            {unit.conditionNote && (
              <>
                <dt className="text-muted-foreground">Condition</dt>
                <dd>{unit.conditionNote}</dd>
              </>
            )}
          </dl>

          {portions.map((portion) => (
            <PortionActions key={portion.id} portion={portion} />
          ))}
        </CardContent>
      </Card>

      {committee && (
        <Card>
          <CardHeader>
            <h3 className={CARD_TITLE_CLASS}>Quantity</h3>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={bought} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="addCount" className="text-xs text-muted-foreground">
                  Bought more
                </label>
                <input
                  id="addCount"
                  type="number"
                  name="addCount"
                  min={1}
                  placeholder="How many"
                  className="h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                />
              </div>
              <SubmitButton variant="secondary">Add</SubmitButton>
            </form>
            <form action={lost} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="removeCount" className="text-xs text-muted-foreground">
                  Lost some
                </label>
                <input
                  id="removeCount"
                  type="number"
                  name="removeCount"
                  min={1}
                  max={unit.quantity - 1}
                  placeholder="How many"
                  className="h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                />
              </div>
              {portions.length > 1 && (
                <NativeSelect name="from" aria-label="From where" className="w-32" defaultValue="">
                  <NativeSelectOption value="" disabled>
                    From where…
                  </NativeSelectOption>
                  {portions.map((p) => (
                    <NativeSelectOption key={p.id} value={placeValue(p)}>
                      {p.whereaboutsType === "store"
                        ? storeName(p.storeId)
                        : p.whereaboutsType === "holder"
                          ? personName(p.holderId)
                          : "Unconfirmed"}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              <SubmitButton variant="secondary">Remove</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      <ClashList clashes={clashes} />
      <HeadsUpList headsUps={headsUps} />

      <section aria-labelledby="movement-log">
        <Card>
          <CardHeader>
            <h3 id="movement-log" className={CARD_TITLE_CLASS}>
              History
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            {log.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {log.map((entry: MovementLogEntry) => (
                  <li key={entry.id} className="px-4 py-3 text-sm text-muted-foreground">
                    {historyLine(entry)}
                    {" — "}
                    {formatWhen(entry.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
