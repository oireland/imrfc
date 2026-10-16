import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ id: "u1" }] }) }) },
}));
vi.mock("@/lib/dev-sign-in", () => ({ devSignInEnabled: () => true }));
vi.mock("@/lib/dev-auth", () => ({
  devAuth: { $context: Promise.resolve({ test: { login: async () => ({ cookies: [] }) } }) },
}));

import { GET } from "./route";

const signIn = (next: string) =>
  GET(new NextRequest(`http://localhost:3000/api/dev/sign-in?email=a@b.org&next=${encodeURIComponent(next)}`));

afterEach(() => vi.unstubAllEnvs());

describe("dev sign-in", () => {
  it("sends the User on to a path on this site", async () => {
    expect((await signIn("/events/abc?tab=out")).headers.get("location")).toBe("http://localhost:3000/events/abc?tab=out");
  });

  it("won't redirect off-site", async () => {
    expect((await signIn("//evil.com")).headers.get("location")).toBe("http://localhost:3000/");
    expect((await signIn("/\\evil.com")).headers.get("location")).toBe("http://localhost:3000/");
  });
});
