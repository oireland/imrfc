import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { groupByWhereabouts, listKitUnits, recordMove, type KitUnit } from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { requireApprovedUser } from "@/lib/session";

export default async function KitViewPage() {
  const user = await requireApprovedUser();

  const [allUnits, locations] = await Promise.all([
    listKitUnits(db, { includeRetired: true }),
    listLocations(db),
  ]);
  const locationsById = new Map(locations.map((l: Location) => [l.id, l]));
  const activeUnits = allUnits.filter((u: KitUnit) => u.status === "active");
  const inactiveUnits = allUnits.filter((u: KitUnit) => u.status !== "active");
  const groups = groupByWhereabouts(activeUnits);
  const stores = locations.filter((l: Location) => l.isStore);

  async function iveGotIt(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, String(formData.get("kitUnitId")), userId, {
      type: "holder",
      holderId: userId,
    });
    revalidatePath("/kit");
  }

  async function putInStore(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, String(formData.get("kitUnitId")), userId, {
      type: "store",
      storeId: String(formData.get("storeId")),
    });
    revalidatePath("/kit");
  }

  function KitRow({ unit }: { unit: KitUnit }) {
    return (
      <li className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Link href={`/kit/${unit.id}`} className="font-medium underline">
          {unit.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <form action={iveGotIt}>
            <input type="hidden" name="kitUnitId" value={unit.id} />
            <button className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
              I&apos;ve got it
            </button>
          </form>
          <form action={putInStore} className="flex items-center gap-1">
            <input type="hidden" name="kitUnitId" value={unit.id} />
            <select name="storeId" className="rounded-md border border-border bg-background px-1 py-1 text-xs">
              {stores.map((s: Location) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
              Put in store
            </button>
          </form>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Kit</h2>

      {groups.length === 0 && <p className="text-muted-foreground">No Kit Units yet.</p>}

      {groups.map((group) => (
        <div key={group.type === "store" ? group.storeId : group.holderId} className="flex flex-col gap-2">
          <h3 className="font-medium text-muted-foreground">
            {group.type === "store"
              ? (locationsById.get(group.storeId)?.name ?? "Store")
              : group.holderId === user.id
                ? "You"
                : "Held"}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.units.map((unit: KitUnit) => (
              <KitRow key={unit.id} unit={unit} />
            ))}
          </ul>
        </div>
      ))}

      {inactiveUnits.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-muted-foreground">Missing / Retired</h3>
          <ul className="flex flex-col gap-2">
            {inactiveUnits.map((unit: KitUnit) => (
              <li key={unit.id} className="rounded-md border border-border p-3">
                <Link href={`/kit/${unit.id}`} className="font-medium underline">
                  {unit.name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">{unit.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
