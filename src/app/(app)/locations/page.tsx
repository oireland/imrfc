import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { archiveLocation, createLocation, listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Locations</h2>
      </div>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {locations.length === 0 && <p className="p-4 text-muted-foreground">No Locations yet.</p>}
          {locations.map((l: Location) => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex flex-col gap-1">
                <p className="font-medium">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.address}</p>
                <div className="flex gap-1">
                  {l.isVenue && <Badge variant="outline">Venue</Badge>}
                  {l.isStore && <Badge variant="outline">Store</Badge>}
                </div>
              </div>
              <form action={archive}>
                <input type="hidden" name="locationId" value={l.id} />
                <SubmitButton variant="outline" size="sm">
                  Archive
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Location</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={create} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-name">Name</Label>
              <Input id="location-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-address">Address</Label>
              <Input id="location-address" name="address" required />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="location-venue" name="isVenue" className="size-4" />
              <Label htmlFor="location-venue">Venue</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="location-store" name="isStore" className="size-4" />
              <Label htmlFor="location-store">Store</Label>
            </div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
