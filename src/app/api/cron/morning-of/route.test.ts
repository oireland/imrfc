import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const markUnconfirmed = vi.fn(async () => {});
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/features/duties", () => ({ markUnconfirmed: () => markUnconfirmed() }));
vi.mock("@/features/push", () => ({ notifyMorningOf: async () => ({ sent: 0 }) }));
vi.mock("@/lib/push", () => ({ getPushSender: () => ({}) }));

import { GET } from "./route";

const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/morning-of", { headers: authorization ? { Authorization: authorization } : {} }));

beforeEach(() => markUnconfirmed.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe("morning-of cron", () => {
  it("rejects a request when CRON_SECRET isn't set, even with 'Bearer undefined'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    delete process.env.CRON_SECRET;

    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect(markUnconfirmed).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("runs with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect((await call("Bearer s3cret")).status).toBe(200);
    expect(markUnconfirmed).toHaveBeenCalled();
  });
});
