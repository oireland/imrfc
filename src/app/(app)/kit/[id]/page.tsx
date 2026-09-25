import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BackLink } from "@/components/back-link";
import { SubmitButton } from "@/components/submit-button";
import { ClashList } from "@/components/clash-list";
import { formatWhen } from "@/lib/format-time";
import { listClashes } from "@/features/duties";
import { getKitUnit, listMovementLog, quickMoveFor, recordMove, type MovementLogEntry } from "@/features/kit";
import { displayName, listApprovedUsers } from "@/features/users";
import { listLocations, type Location } from "@/features/locations";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-[22px] leading-tight";

export default async function KitUnitDetailPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const unit = await getKitUnit(db, id);
  if (!unit) notFound();

  const [locations, log, allClashes, people] = await Promise.all([
    listLocations(db),
    listMovementLog(db, id),
    listClashes(db),
    listApprovedUsers(db),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const personName = (personId: string | null) => {
    if (personId === user.id) return "you";
    const person = personId ? personById.get(personId) : undefined;
    return person ? displayName(person) : "someone";
  };
  const clashes = allClashes.filter((c) => c.kitUnitId === id);
  const locationsById = new Map(locations.map((l: Location) => [l.id, l]));
  const stores = locations.filter((l: Location) => l.isStore);
  const storeName = (storeId: string | null) => (storeId && locationsById.get(storeId)?.name) || "a Store";
  const whereaboutsLabel =
    unit.whereaboutsType === "store"
      ? `In ${storeName(unit.storeId)}`
      : unit.whereaboutsType === "unconfirmed"
        ? "Unconfirmed"
        : `With ${personName(unit.holderId)}`;
  const move = quickMoveFor(unit, user.id);

  async function quickMove() {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const current = await getKitUnit(db, id);
    if (!current) return;
    await recordMove(db, id, userId, quickMoveFor(current, userId));
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

          <form action={putInStore} className="flex flex-col gap-1.5">
            <label htmlFor="put-in-store" className="text-xs text-muted-foreground">
              Or put it in a Store
            </label>
            <div className="flex gap-2">
              <NativeSelect id="put-in-store" name="storeId" className="flex-1" defaultValue={unit.homeId}>
                {stores.map((s: Location) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <SubmitButton variant="secondary">Put in store</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <ClashList clashes={clashes} />

      <section aria-labelledby="movement-log">
        <Card>
          <CardHeader>
            <h3 id="movement-log" className={CARD_TITLE_CLASS}>
              Movement Log
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            {log.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {log.map((entry: MovementLogEntry) => (
                  <li key={entry.id} className="px-4 py-3 text-sm text-muted-foreground">
                    {entry.kind === "move"
                      ? `${entry.toType === "store" ? `Put in ${storeName(entry.toStoreId)}` : `Now with ${personName(entry.toHolderId)}`}${
                          entry.reason === "duty" ? " (Duty Confirmed)" : ""
                        }`
                      : `Condition Note: ${entry.conditionNote}`}
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
