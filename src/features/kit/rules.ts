export type NewKitUnit = {
  name: string;
  homeId: string;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateKitUnit(kitUnit: NewKitUnit): ValidationResult {
  if (!kitUnit.name.trim()) return { ok: false, error: "A Kit Unit needs a name." };
  if (!kitUnit.homeId) return { ok: false, error: "A Kit Unit needs a Home." };
  return { ok: true };
}
