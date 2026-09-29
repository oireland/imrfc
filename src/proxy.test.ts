import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runsOn = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe("proxy matcher", () => {
  it.each(["/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/icons/icon-512-maskable.png", "/icons/apple-touch-icon.png"])(
    "leaves the PWA file %s reachable without signing in (browsers fetch them without cookies)",
    (pathname) => expect(runsOn(pathname)).toBe(false),
  );

  it.each(["/", "/events/1", "/equipment"])("still guards %s", (pathname) => expect(runsOn(pathname)).toBe(true));
});
