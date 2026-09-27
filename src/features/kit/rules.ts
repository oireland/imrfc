export type NewKitUnit = {
  name: string;
  homeId: string;
  /** Defaults to 1; hidden in the UI until raised. */
  quantity?: number;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateKitUnit(kitUnit: NewKitUnit): ValidationResult {
  if (!kitUnit.name.trim()) return { ok: false, error: "Give the kit a name." };
  if (!kitUnit.homeId) return { ok: false, error: "Choose where the kit lives." };
  if (kitUnit.quantity !== undefined && (!Number.isInteger(kitUnit.quantity) || kitUnit.quantity < 1)) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  return { ok: true };
}
