import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const runsOn = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe("proxy matcher", () => {
  it.each(["/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/icons/icon-512-maskable.png", "/icons/apple-touch-icon.png"])(
    "leaves the PWA file %s reachable without signing in (browsers fetch them without cookies)",
    (pathname) => expect(runsOn(pathname)).toBe(false),
  );

  it.each(["/", "/events/1", "/equipment"])("still guards %s", (pathname) => expect(runsOn(pathname)).toBe(true));
});

describe("proxy when signed out", () => {
  const locationOf = (url: string) => new URL(proxy(new NextRequest(url)).headers.get("location")!);

  it("keeps the error Better Auth redirects with, so the sign-in page can say why the link failed", () => {
    const location = locationOf("https://app.imrfc.co.uk/?error=INVALID_TOKEN&error_description=Token%20expired");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(location.searchParams.get("error_description")).toBe("Token expired");
  });

  it("still remembers where to come back to", () => {
    const location = locationOf("https://app.imrfc.co.uk/events/1?error=INVALID_TOKEN");
    expect(location.searchParams.get("next")).toBe("/events/1");
    expect(location.searchParams.get("error")).toBe("INVALID_TOKEN");
  });

  it("sends a plain visit to a bare sign-in page", () => {
    expect(locationOf("https://app.imrfc.co.uk/").search).toBe("");
  });
});
