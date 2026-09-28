import { describe, expect, it } from "vitest";
import { devSignInEnabled } from "./dev-sign-in";

describe("devSignInEnabled", () => {
  it("is on only when DEV_SIGN_IN=1 outside production", () => {
    expect(devSignInEnabled({ NODE_ENV: "development", DEV_SIGN_IN: "1" })).toBe(true);
    expect(devSignInEnabled({ NODE_ENV: "test", DEV_SIGN_IN: "1" })).toBe(true);
  });

  it("is off without the flag", () => {
    expect(devSignInEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devSignInEnabled({ NODE_ENV: "development", DEV_SIGN_IN: "true" })).toBe(false);
  });

  it("is always off in production, even with the flag", () => {
    expect(devSignInEnabled({ NODE_ENV: "production", DEV_SIGN_IN: "1" })).toBe(false);
    expect(devSignInEnabled({ NODE_ENV: "development", VERCEL_ENV: "preview", DEV_SIGN_IN: "1" })).toBe(false);
  });
});
