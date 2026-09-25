export type NewLocation = {
  name: string;
  address: string;
  isVenue: boolean;
  isStore: boolean;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateLocation(location: NewLocation): ValidationResult {
  if (!location.isVenue && !location.isStore) {
    return { ok: false, error: "A Location must be a Venue, a Store, or both." };
  }
  return { ok: true };
}
