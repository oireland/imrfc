import { describe, expect, it } from "vitest";
import { confirmPageUrl, verifyUrlFromConfirmParams } from "./sign-in-confirm";

const verify = "https://app.imrfc.co.uk/api/auth/magic-link/verify?token=abc&callbackURL=%2Fevents%2F1";

describe("sign-in confirm page", () => {
  it("points the emailed link at a page on our site, not at the token-consuming verify endpoint", () => {
    const url = new URL(confirmPageUrl(verify));
    expect(url.origin).toBe("https://app.imrfc.co.uk");
    expect(url.pathname).toBe("/sign-in/confirm");
    expect(url.pathname).not.toContain("/api/");
  });

  it("round-trips back to the verify URL the button goes to", () => {
    const params = new URL(confirmPageUrl(verify)).searchParams;
    expect(verifyUrlFromConfirmParams(params)).toBe("/api/auth/magic-link/verify?token=abc&callbackURL=%2Fevents%2F1");
  });

  it("has no verify URL without a token", () => {
    expect(verifyUrlFromConfirmParams(new URLSearchParams())).toBeNull();
  });
});
