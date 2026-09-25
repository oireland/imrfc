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
import { getKitUnit, listMovementLog, quickMoveFor, recordMove, type MovementLogEntry } from "@/features/kit";
import { getEvent } from "@/features/events";
import { displayName, listApprovedUsers } from "@/features/users";
import { listStores, type Store } from "@/features/stores";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-[22px] leading-tight";

export default async function KitUnitDetailPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const unit = await getKitUnit(db, id);
  if (!unit) notFound();

  const [stores, log, allClashes, allHeadsUps, people] = await Promise.all([
    listStores(db),
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
  const lastSeen = unit.lastSeenEventId ? await getEvent(db, unit.lastSeenEventId) : undefined;
  const giveable = people.filter(
    (p) => p.accessState === "approved" && p.id !== user.id && !(unit.whereaboutsType === "holder" && p.id === unit.holderId),
  );
  const clashes = allClashes.filter((c) => c.kitUnitId === id);
  const headsUps = allHeadsUps.filter((h) => h.kitUnitId === id);
  const storesById = new Map(stores.map((s: Store) => [s.id, s]));
  const storeName = (storeId: string | null) => (storeId && storesById.get(storeId)?.name) || "a store";
  const whereaboutsLabel =
    unit.whereaboutsType === "store"
      ? `In ${storeName(unit.storeId)}`
      : unit.whereaboutsType === "unconfirmed"
        ? `Not confirmed — last seen at ${lastSeen?.title ?? "an event"}`
        : `With ${personName(unit.holderId)}`;
  const move = quickMoveFor(unit, user.id);

  /** One Movement Log entry as a sentence: "You put it in the Shed", "Tom gave it to Priya". */
  function historyLine(entry: MovementLogEntry): string {
    const who = capitalised(personName(entry.userId));
    if (entry.kind === "condition_note") return `${who} noted: “${entry.conditionNote}”`;
    const where =
      entry.toType === "store" ? `in ${storeName(entry.toStoreId)}` : `with ${personName(entry.toHolderId)}`;
    if (entry.reason === "duty") {
      if (entry.toType === "store") return `${who} put it back ${where} (duty done)`;
      if (entry.toHolderId === entry.userId) return `${who} brought it along (duty done)`;
      return `${who} confirmed it's ${where} (duty done)`;
    }
    if (entry.toType === "store") return `${who} put it ${where}`;
    if (entry.toHolderId === entry.userId) return `${who} took it`;
    return `${who} gave it to ${personName(entry.toHolderId)}`;
  }

  async function quickMove() {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const current = await getKitUnit(db, id);
    if (!current) return;
    await recordMove(db, id, userId, quickMoveFor(current, userId));
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function giveTo(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const holderId = String(formData.get("holderId"));
    const recipient = (await listApprovedUsers(db)).find((p) => p.id === holderId && p.accessState === "approved");
    if (!recipient) return;
    await recordMove(db, id, userId, { type: "holder", holderId });
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  async function putInStore(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, id, userId, { type: "store", storeId: String(formData.get("storeId")) });
    revalidatePath(`/kit/${id}`);
    revalidatePath("/kit");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/kit">Kit</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">{unit.name}</h2>
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

          <form action={quickMove}>
            <SubmitButton size="lg" className="h-11 w-full" variant={move.type === "holder" ? "default" : "outline"}>
              {move.type === "holder" ? "I've got it" : `Return to ${storeName(move.storeId)}`}
            </SubmitButton>
          </form>

          {giveable.length > 0 && (
            <form action={giveTo} className="flex flex-col gap-1.5">
              <label htmlFor="give-to" className="text-xs text-muted-foreground">
                Or give it to someone
              </label>
              <div className="flex gap-2">
                <NativeSelect id="give-to" name="holderId" className="flex-1" defaultValue="" required>
                  <NativeSelectOption value="" disabled>
                    Choose a person…
                  </NativeSelectOption>
                  {giveable.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {displayName(p)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <SubmitButton variant="secondary">Give</SubmitButton>
              </div>
            </form>
          )}

          <form action={putInStore} className="flex flex-col gap-1.5">
            <label htmlFor="put-in-store" className="text-xs text-muted-foreground">
              Or put it away in
            </label>
            <div className="flex gap-2">
              <NativeSelect id="put-in-store" name="storeId" className="flex-1" defaultValue={unit.homeId}>
                {stores.map((s: Store) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <SubmitButton variant="secondary">Put away</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

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
