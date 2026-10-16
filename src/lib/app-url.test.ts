import { describe, expect, it } from "vitest";
import { appUrl, eventLink } from "./app-url";

describe("appUrl", () => {
  it("uses APP_URL, then BETTER_AUTH_URL, without a trailing slash", () => {
    expect(appUrl({ APP_URL: "https://hub.imrfc.co.uk/", BETTER_AUTH_URL: "https://other.test" })).toBe("https://hub.imrfc.co.uk");
    expect(appUrl({ BETTER_AUTH_URL: "https://hub.imrfc.co.uk" })).toBe("https://hub.imrfc.co.uk");
  });

  it("falls back to the production domain Vercel provides, then local dev", () => {
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "imrfc.vercel.app" })).toBe("https://imrfc.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });

  it("never takes the address from a preview deployment's own URL", () => {
    expect(appUrl({ VERCEL_URL: "imrfc-git-branch.vercel.app" })).toBe("http://localhost:3000");
  });
});

describe("eventLink", () => {
  it("is the Event's page on the app URL", () => {
    expect(eventLink("abc", { APP_URL: "https://hub.imrfc.co.uk" })).toBe("https://hub.imrfc.co.uk/events/abc");
  });
});
