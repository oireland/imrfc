import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  createKitUnit,
  listKitUnits,
  setConditionNote,
  setKitStatus,
  type KitStatus,
  type KitUnit,
} from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";

const STATUSES: KitStatus[] = ["active", "missing", "retired"];

const STATUS_LABEL: Record<KitStatus, string> = {
  active: "Active",
  missing: "Missing",
  retired: "Retired",
};

const STATUS_BADGE_VARIANT: Record<KitStatus, "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  missing: "destructive",
  retired: "outline",
};

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
    revalidatePath("/admin/kit");
  }

  async function changeStatus(formData: FormData) {
    "use server";
    await setKitStatus(db, String(formData.get("kitUnitId")), formData.get("status") as KitStatus);
    revalidatePath("/admin/kit");
  }

  async function changeNote(formData: FormData) {
    "use server";
    await setConditionNote(
      db,
      String(formData.get("kitUnitId")),
      user!.id,
      String(formData.get("conditionNote")),
    );
    revalidatePath("/admin/kit");
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h2 className="text-xl font-semibold">Kit Units</h2>
      </div>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {units.length === 0 && <p className="p-4 text-muted-foreground">No Kit Units yet.</p>}
          {units.map((k: KitUnit) => (
            <div key={k.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{k.name}</p>
                  <Badge variant={STATUS_BADGE_VARIANT[k.status]}>{STATUS_LABEL[k.status]}</Badge>
                </div>
                <form action={changeStatus} className="flex items-center gap-2">
                  <input type="hidden" name="kitUnitId" value={k.id} />
                  <NativeSelect
                    name="status"
                    defaultValue={k.status}
                    size="sm"
                    aria-label={`Kit Status for ${k.name}`}
                  >
                    {STATUSES.map((s) => (
                      <NativeSelectOption key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <SubmitButton size="sm" variant="outline">
                    Save
                  </SubmitButton>
                </form>
              </div>
              <form action={changeNote} className="flex items-center gap-2">
                <input type="hidden" name="kitUnitId" value={k.id} />
                <Label htmlFor={`note-${k.id}`} className="sr-only">
                  Condition Note for {k.name}
                </Label>
                <Input
                  id={`note-${k.id}`}
                  name="conditionNote"
                  defaultValue={k.conditionNote}
                  placeholder="Condition Note"
                  className="flex-1"
                />
                <SubmitButton size="sm" variant="outline">
                  Save
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Kit Unit</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={create} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kit-name">Name</Label>
              <Input id="kit-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kit-home">Home</Label>
              <NativeSelect id="kit-home" name="homeId" required>
                <NativeSelectOption value="">Home...</NativeSelectOption>
                {stores.map((s: Location) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
