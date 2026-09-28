export type NewEquipmentUnit = {
  name: string;
  homeId: string;
  /** Defaults to 1; hidden in the UI until raised. */
  quantity?: number;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateEquipmentUnit(equipmentUnit: NewEquipmentUnit): ValidationResult {
  if (!equipmentUnit.name.trim()) return { ok: false, error: "Give the equipment a name." };
  if (!equipmentUnit.homeId) return { ok: false, error: "Choose where the equipment lives." };
  if (equipmentUnit.quantity !== undefined && (!Number.isInteger(equipmentUnit.quantity) || equipmentUnit.quantity < 1)) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  return { ok: true };
}
