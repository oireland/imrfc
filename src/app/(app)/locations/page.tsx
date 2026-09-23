import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { archiveLocation, createLocation, listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export default async function LocationsPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const locations = await listLocations(db);

  async function create(formData: FormData) {
    "use server";
    await createLocation(db, {
      name: String(formData.get("name")),
      address: String(formData.get("address")),
      isVenue: formData.get("isVenue") === "on",
      isStore: formData.get("isStore") === "on",
    });
    revalidatePath("/locations");
  }

  async function archive(formData: FormData) {
    "use server";
    await archiveLocation(db, String(formData.get("locationId")));
    revalidatePath("/locations");
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Locations</h2>

      <ul className="flex flex-col gap-2">
        {locations.length === 0 && <p className="text-muted-foreground">No Locations yet.</p>}
        {locations.map((l: Location) => (
          <li
            key={l.id}
            className="flex items-center justify-between rounded-md border border-border p-3"
          >
            <div>
              <p className="font-medium">{l.name}</p>
              <p className="text-sm text-muted-foreground">{l.address}</p>
              <p className="text-xs text-muted-foreground">
                {[l.isVenue && "Venue", l.isStore && "Store"].filter(Boolean).join(" · ")}
              </p>
            </div>
            <form action={archive}>
              <input type="hidden" name="locationId" value={l.id} />
              <button className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground">
                Archive
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={create} className="flex flex-col gap-3 rounded-md border border-border p-3">
        <h3 className="font-medium">Add a Location</h3>
        <input
          name="name"
          placeholder="Name"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        />
        <input
          name="address"
          placeholder="Address"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isVenue" /> Venue
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isStore" /> Store
        </label>
        <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Add</button>
      </form>
    </div>
  );
}
