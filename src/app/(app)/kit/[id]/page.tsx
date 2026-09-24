import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ClashList } from "@/components/clash-list";
import { listClashes } from "@/features/duties";
import { getKitUnit, listMovementLog, recordMove, type MovementLogEntry } from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { requireApprovedUser } from "@/lib/session";

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
    <div className="flex flex-col gap-6">
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
          <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
            I&apos;ve got it
          </button>
        </form>
        <form action={putInStore} className="flex items-center gap-2">
          <select
            name="storeId"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {stores.map((s: Location) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
            Put in store
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Movement Log</h3>
        <ul className="flex flex-col gap-1">
          {log.length === 0 && <p className="text-muted-foreground">No history yet.</p>}
          {log.map((entry: MovementLogEntry) => (
            <li key={entry.id} className="text-sm text-muted-foreground">
              {entry.kind === "move"
                ? `Moved to ${
                    entry.toType === "store"
                      ? (locationsById.get(entry.toStoreId!)?.name ?? "a Store")
                      : "a Holder"
                  } (${entry.reason})`
                : `Condition Note: ${entry.conditionNote}`}
              {" — "}
              {entry.createdAt.toLocaleString?.() ?? String(entry.createdAt)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
