import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BackLink } from "@/components/back-link";
import { SubmitButton } from "@/components/submit-button";
import { QuickMoveBlockButton } from "@/components/quick-move-button";
import { ClashList } from "@/components/clash-list";
import { HeadsUpList } from "@/components/heads-up-list";
import { formatWhen } from "@/lib/format-time";
import { listPlanWarnings } from "@/features/duties";
import {
  describeWhereabouts,
  getEquipmentUnit,
  getPortions,
  listMovementLog,
  quickMoveFor,
  recordMove,
  setQuantity,
  type MovementLogEntry,
  type Place,
  type Portion,
} from "@/features/equipment";
import { listEventTitles } from "@/features/events";
import { displayName, isCommitteeOrAbove, listApprovedUsers, listKnownUsers } from "@/features/users";
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

export default async function EquipmentUnitDetailPage({ params }: PageProps<"/equipment/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const [found, stores, portions, log, warnings, people] = await Promise.all([
    getEquipmentUnit(db, id),
    listStores(db, { includeArchived: true }),
    getPortions(db, id),
    listMovementLog(db, id),
    listPlanWarnings(db, new Date(), { equipmentUnitId: id }),
    listKnownUsers(db),
  ]);
  if (!found) notFound();
  const unit = found;
  const personById = new Map(people.map((p) => [p.id, p]));
  const personName = (personId: string | null) => {
    if (personId === user.id) return "you";
    const person = personId ? personById.get(personId) : undefined;
    return person ? displayName(person) : "someone";
  };
  const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const eventNames = await listEventTitles(db, [
    ...portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])),
    ...log.flatMap((e) => (e.toLastSeenEventId ? [e.toLastSeenEventId] : [])),
  ]);
  const eventName = (eventId: string | null) => (eventId && eventNames.get(eventId)) || "an event";
  const clashes = warnings.clashes.filter((c) => c.equipmentUnitId === id);
  const headsUps = warnings.headsUps.filter((h) => h.equipmentUnitId === id);
  const storesById = new Map(stores.map((s: Store) => [s.id, s]));
  const storeName = (storeId: string | null) => (storeId && storesById.get(storeId)?.name) || "a store";
  const whereaboutsLabel = describeWhereabouts(portions, {
    storeName,
    personName,
    eventName,
  });
  const split = unit.quantity > 1;
  const committee = isCommitteeOrAbove(user.role);

  /** One Movement Log entry as a sentence: "You put it in the Shed", "Tom gave it to Priya". */
  function historyLine(entry: MovementLogEntry): string {
    const who = capitalised(personName(entry.userId));
    const word = split && entry.count ? String(entry.count) : "it";
    if (entry.kind === "condition_note") return `${who} noted: “${entry.conditionNote}”`;
    if (entry.kind === "added") return `${entry.userId ? who : "Someone"} added ${word} to ${storeName(entry.toStoreId)}`;
    if (entry.kind === "bought") return `${who} bought ${entry.count}`;
    if (entry.kind === "lost") return `${who} lost ${entry.count}`;
    if (entry.kind === "unconfirmed") return `Nobody confirmed where ${word} went after ${eventName(entry.toLastSeenEventId)}`;
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
    const [current, currentPortions] = await Promise.all([getEquipmentUnit(db, id), getPortions(db, id)]);
    const portion = currentPortions.find((p) => p.id === portionId) ?? currentPortions[0];
    if (!current || !portion) return;
    const count = formData.get("count");
    const move = quickMoveFor({ unit: current, portion }, userId, count ? Number(count) : undefined);
    await recordMove(db, id, userId, move.to, "ad_hoc", { count: move.count, from: move.from });
    revalidatePath(`/equipment/${id}`);
    revalidatePath("/equipment");
  }

  async function giveTo(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const holderId = String(formData.get("holderId"));
    const from = parsePlace(String(formData.get("from")));
    const count = Number(formData.get("count"));
    const recipient = (await listApprovedUsers(db)).find((p) => p.id === holderId);
    if (!recipient || !count) return;
    await recordMove(db, id, userId, { type: "holder", holderId }, "ad_hoc", { count, from });
    revalidatePath(`/equipment/${id}`);
    revalidatePath("/equipment");
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
    revalidatePath(`/equipment/${id}`);
    revalidatePath("/equipment");
  }

  async function changeQuantity(formData: FormData) {
    "use server";
    const { id: userId, role } = await requireApprovedUser();
    if (!isCommitteeOrAbove(role)) return;
    const quantity = Number(formData.get("quantity"));
    const fromValue = String(formData.get("from") ?? "");
    await setQuantity(db, id, userId, quantity, fromValue ? parsePlace(fromValue) : undefined);
    revalidatePath(`/equipment/${id}`);
    revalidatePath("/equipment");
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

        <QuickMoveBlockButton
          action={quickMove}
          fields={{ portionId: portion.id }}
          available={split ? portion.count : 1}
          returnTo={move.to.type === "store" ? storeName(move.to.storeId) : null}
        />

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
              {stores.filter((s: Store) => !s.archived).map((s: Store) => (
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
        <BackLink href="/equipment">Equipment</BackLink>
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
            <form action={changeQuantity} className="flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="quantity" className="text-xs text-muted-foreground">
                    How many there are now
                  </label>
                  <input
                    id="quantity"
                    type="number"
                    name="quantity"
                    min={1}
                    required
                    defaultValue={unit.quantity}
                    className="h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                  />
                </div>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </div>
              {portions.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="quantity-from" className="text-xs text-muted-foreground">
                    If some were lost, which ones?
                  </label>
                  <NativeSelect id="quantity-from" name="from" defaultValue="">
                    <NativeSelectOption value="" disabled>
                      Choose where from…
                    </NativeSelectOption>
                    {portions.map((p) => (
                      <NativeSelectOption key={p.id} value={placeValue(p)}>
                        {p.whereaboutsType === "store"
                          ? storeName(p.storeId)
                          : p.whereaboutsType === "holder"
                            ? capitalised(personName(p.holderId))
                            : "Not confirmed"}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
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
