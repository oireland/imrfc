import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { ClashList } from "@/components/clash-list";
import { formatWhen } from "@/lib/format-time";
import { listClashes } from "@/features/duties";
import { getKitUnit, listMovementLog, recordMove, type MovementLogEntry } from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-base leading-snug font-medium";

export default async function KitUnitDetailPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;
  await requireApprovedUser();

  const unit = await getKitUnit(db, id);
  if (!unit) notFound();

  const [locations, log, allClashes] = await Promise.all([listLocations(db), listMovementLog(db, id), listClashes(db)]);
  const clashes = allClashes.filter((c) => c.kitUnitId === id);
  const locationsById = new Map(locations.map((l: Location) => [l.id, l]));
  const stores = locations.filter((l: Location) => l.isStore);
  const whereaboutsLabel =
    unit.whereaboutsType === "store" && unit.storeId
      ? (locationsById.get(unit.storeId)?.name ?? "Store")
      : unit.whereaboutsType === "unconfirmed"
        ? "Unconfirmed"
        : "Holder";

  async function iveGotIt() {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, id, userId, { type: "holder", holderId: userId });
    revalidatePath(`/kit/${id}`);
  }

  async function putInStore(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, id, userId, { type: "store", storeId: String(formData.get("storeId")) });
    revalidatePath(`/kit/${id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{unit.name}</h2>
        <p className="text-sm text-muted-foreground">Whereabouts: {whereaboutsLabel}</p>
        {unit.conditionNote && (
          <p className="text-sm text-muted-foreground">Condition: {unit.conditionNote}</p>
        )}
      </div>

      <ClashList clashes={clashes} />

      <div className="flex flex-wrap items-center gap-2">
        <form action={iveGotIt}>
          <SubmitButton variant="secondary">I&apos;ve got it</SubmitButton>
        </form>
        <form action={putInStore} className="flex items-center gap-2">
          <NativeSelect name="storeId" aria-label={`Put ${unit.name} in store`}>
            {stores.map((s: Location) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton variant="secondary">Put in store</SubmitButton>
        </form>
      </div>

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
                      ? `Moved to ${
                          entry.toType === "store"
                            ? (locationsById.get(entry.toStoreId!)?.name ?? "a Store")
                            : "a Holder"
                        } (${entry.reason})`
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
