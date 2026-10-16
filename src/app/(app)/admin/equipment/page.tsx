import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  listEquipmentUnits,
  retireEquipmentUnit,
  setConditionNote,
  setEquipmentStatus,
  type EquipmentStatus,
  type EquipmentUnit,
} from "@/features/equipment";
import { requireCommittee } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ResultForm } from "@/components/result-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { BackLink } from "@/components/back-link";

const STATUSES: EquipmentStatus[] = ["active", "missing", "retired"];

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: "Active",
  missing: "Missing",
  retired: "Retired",
};

const STATUS_BADGE_VARIANT: Record<EquipmentStatus, "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  missing: "destructive",
  retired: "outline",
};

export default async function EquipmentUnitsPage() {
  await requireCommittee();

  const units = await listEquipmentUnits(db, { includeRetired: true });

  async function changeStatus(formData: FormData) {
    "use server";
    await requireCommittee();
    const status = String(formData.get("status"));
    if (!STATUSES.includes(status as EquipmentStatus)) return;
    await setEquipmentStatus(db, String(formData.get("equipmentUnitId")), status as EquipmentStatus);
    revalidatePath("/admin/equipment");
  }

  async function changeNote(formData: FormData) {
    "use server";
    const current = await requireCommittee();
    const result = await setConditionNote(
      db,
      String(formData.get("equipmentUnitId")),
      current.id,
      String(formData.get("conditionNote")),
    );
    if (result.ok) revalidatePath("/admin/equipment");
    return result;
  }

  async function retire(formData: FormData) {
    "use server";
    await requireCommittee();
    await retireEquipmentUnit(db, String(formData.get("equipmentUnitId")));
    revalidatePath("/admin/equipment");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Equipment</h2>
      </div>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {units.length === 0 && <p className="p-4 text-muted-foreground">No equipment yet.</p>}
          {units.map((k: EquipmentUnit) => (
            <div key={k.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{k.name}</p>
                  <Badge variant={STATUS_BADGE_VARIANT[k.status]}>{STATUS_LABEL[k.status]}</Badge>
                </div>
                <form action={changeStatus} className="flex items-center gap-2">
                  <input type="hidden" name="equipmentUnitId" value={k.id} />
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
              <ResultForm action={changeNote} resetOnSuccess={false} className="flex items-center gap-2">
                <input type="hidden" name="equipmentUnitId" value={k.id} />
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
              </ResultForm>
              {k.status !== "retired" && (
                <div className="flex justify-end">
                  <form id={`retire-${k.id}`} action={retire}>
                    <input type="hidden" name="equipmentUnitId" value={k.id} />
                  </form>
                  <ConfirmSubmit
                    formId={`retire-${k.id}`}
                    triggerLabel="Retire"
                    triggerSize="sm"
                    triggerVariant="ghost"
                    title={`Retire ${k.name}?`}
                    description="It leaves circulation and can't go on a list. Its history is kept, and you can make it Active again from the status above."
                    confirmLabel="Retire"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
