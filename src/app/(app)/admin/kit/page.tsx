import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  deleteKitUnit,
  listKitUnits,
  setConditionNote,
  setKitStatus,
  type KitStatus,
  type KitUnit,
} from "@/features/kit";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { BackLink } from "@/components/back-link";

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

  const units = await listKitUnits(db, { includeRetired: true });

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

  async function remove(formData: FormData) {
    "use server";
    await deleteKitUnit(db, String(formData.get("kitUnitId")));
    revalidatePath("/admin/kit");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Kit</h2>
      </div>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {units.length === 0 && <p className="p-4 text-muted-foreground">No kit yet.</p>}
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
                    aria-label={`Status of ${k.name}`}
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
                  Condition of {k.name}
                </Label>
                <Input
                  id={`note-${k.id}`}
                  name="conditionNote"
                  defaultValue={k.conditionNote}
                  placeholder="Condition, e.g. 2 balls need pumping"
                  className="flex-1"
                />
                <SubmitButton size="sm" variant="outline">
                  Save
                </SubmitButton>
              </form>
              <div className="flex justify-end">
                <form id={`delete-${k.id}`} action={remove}>
                  <input type="hidden" name="kitUnitId" value={k.id} />
                </form>
                <ConfirmSubmit
                  formId={`delete-${k.id}`}
                  triggerLabel="Delete"
                  triggerSize="sm"
                  triggerVariant="ghost"
                  title={`Delete ${k.name}?`}
                  description="This removes it for good, not just Retired — use this only for a mistake, e.g. a typo or a duplicate."
                  confirmLabel="Delete"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
