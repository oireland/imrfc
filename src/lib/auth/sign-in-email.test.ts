import { describe, expect, it } from "vitest";
import { signInEmail } from "./sign-in-email";

const url = "https://app.imrfc.co.uk/api/auth/magic-link/verify?token=abc&callbackURL=%2F";

describe("signInEmail", () => {
  it("has the sign-in link in both the text and a Clubhouse-styled button", () => {
    const email = signInEmail(url);
    expect(email.subject).toBe("Sign in to IMRFC");
    expect(email.text).toContain(url);
    expect(email.html).toContain(`<a href="${url.replace(/&/g, "&amp;")}"`);
    expect(email.html).toContain(">Sign in</a>");
    expect(email.html).toContain('src="cid:crest"');
  });
});
