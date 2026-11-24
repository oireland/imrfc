import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("./auth", () => ({ auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
// React's per-request cache would hold the first user for the whole file.
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

import { requireAdmin, requireCommittee } from "./session";

function signedInAs(role: string, accessState = "approved") {
  getSession.mockResolvedValue({ user: { id: "u1", name: "U", email: "u@x.org", role, accessState } });
}

beforeEach(() => getSession.mockReset());

describe("requireCommittee", () => {
  it("lets Committee and Admins through", async () => {
    signedInAs("committee");
    expect((await requireCommittee()).role).toBe("committee");
    signedInAs("admin");
    expect((await requireCommittee()).role).toBe("admin");
  });

  it("sends a Member home", async () => {
    signedInAs("member");
    await expect(requireCommittee()).rejects.toThrow("redirect:/");
  });

  it("sends a Blocked Committee member to the blocked screen", async () => {
    signedInAs("committee", "blocked");
    await expect(requireCommittee()).rejects.toThrow("redirect:/blocked");
  });
});

describe("requireAdmin", () => {
  it("lets an Admin through", async () => {
    signedInAs("admin");
    expect((await requireAdmin()).role).toBe("admin");
  });

  it("sends Committee home", async () => {
    signedInAs("committee");
    await expect(requireAdmin()).rejects.toThrow("redirect:/");
  });

  it("sends a Blocked Admin to the blocked screen", async () => {
    signedInAs("admin", "blocked");
    await expect(requireAdmin()).rejects.toThrow("redirect:/blocked");
  });
});
