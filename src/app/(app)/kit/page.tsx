import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createKitUnit, listKitUnits, setConditionNote, setKitStatus, type KitStatus, type KitUnit } from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

const STATUSES: KitStatus[] = ["active", "missing", "retired"];

export default async function KitUnitsPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const [units, stores] = await Promise.all([
    listKitUnits(db, { includeRetired: true }),
    listLocations(db).then((ls: Location[]) => ls.filter((l) => l.isStore)),
  ]);

  async function create(formData: FormData) {
    "use server";
    await createKitUnit(db, {
      name: String(formData.get("name")),
      homeId: String(formData.get("homeId")),
    });
    revalidatePath("/kit");
  }

  async function changeStatus(formData: FormData) {
    "use server";
    await setKitStatus(db, String(formData.get("kitUnitId")), formData.get("status") as KitStatus);
    revalidatePath("/kit");
  }

  async function changeNote(formData: FormData) {
    "use server";
    await setConditionNote(
      db,
      String(formData.get("kitUnitId")),
      String(formData.get("conditionNote")),
    );
    revalidatePath("/kit");
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Kit Units</h2>

      <ul className="flex flex-col gap-2">
        {units.length === 0 && <p className="text-muted-foreground">No Kit Units yet.</p>}
        {units.map((k: KitUnit) => (
          <li key={k.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{k.name}</p>
              <form action={changeStatus} className="flex items-center gap-2">
                <input type="hidden" name="kitUnitId" value={k.id} />
                <select name="status" defaultValue={k.status} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                  Save
                </button>
              </form>
            </div>
            <form action={changeNote} className="flex items-center gap-2">
              <input type="hidden" name="kitUnitId" value={k.id} />
              <input
                name="conditionNote"
                defaultValue={k.conditionNote}
                placeholder="Condition Note"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <button className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={create} className="flex flex-col gap-3 rounded-md border border-border p-3">
        <h3 className="font-medium">Add a Kit Unit</h3>
        <input
          name="name"
          placeholder="Name"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        />
        <select
          name="homeId"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        >
          <option value="">Home...</option>
          {stores.map((s: Location) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Add</button>
      </form>
    </div>
  );
}
