import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export type ParsedMobileNumber = { ok: true; number: string | null } | { ok: false; error: string };

const INVALID = "That doesn't look like a mobile number. Try 07… or start with + and the country code.";

/** Reads what a User typed as a Mobile number: `07…` is UK, `+…` is international. Empty clears it. */
export function parseMobileNumber(input: string): ParsedMobileNumber {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, number: null };
  const parsed = parsePhoneNumberFromString(trimmed, "GB");
  if (!parsed?.isValid()) return { ok: false, error: INVALID };
  return { ok: true, number: parsed.number };
}

/** WhatsApp's click-to-chat link for an E.164 number, optionally with a message prefilled. */
export function whatsappLink(number: string, message?: string): string {
  const base = `https://wa.me/${number.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
