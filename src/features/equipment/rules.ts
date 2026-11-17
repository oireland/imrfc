import { LIMITS, firstTooLong } from "@/lib/text-limits";
export type NewEquipmentUnit = {
  name: string;
  homeId: string;
  /** Defaults to 1; hidden in the UI until raised. */
  quantity?: number;
  /** Who added it, for the Movement Log. */
  addedBy?: string;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateEquipmentUnit(equipmentUnit: NewEquipmentUnit): ValidationResult {
  const tooLong = firstTooLong([["name", equipmentUnit.name, LIMITS.name]]);
  if (tooLong) return { ok: false, error: tooLong };
  if (!equipmentUnit.name.trim()) return { ok: false, error: "Give the equipment a name." };
  if (!equipmentUnit.homeId) return { ok: false, error: "Choose where the equipment lives." };
  if (equipmentUnit.quantity !== undefined && (!Number.isInteger(equipmentUnit.quantity) || equipmentUnit.quantity < 1)) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  return { ok: true };
}
