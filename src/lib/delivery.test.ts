import { describe, expect, it, vi } from "vitest";
import { canRetry, deliverEach, deliveryProgress, deliveryStatus, finish, restart, stillToReach } from "./delivery";

const createdAt = new Date("2026-10-01T12:00:00Z");
const later = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);
const row = (over: Partial<Parameters<typeof deliveryProgress>[0]> = {}) => ({ createdAt, finishedAt: null, reachedIds: [], missedIds: [], ...over });

describe("deliveryStatus", () => {
  it("is sending until the emails have all been tried", () => {
    expect(deliveryStatus(row(), later(1))).toBe("sending");
  });

  it("is sent when everyone was reached, and failed when anyone wasn't", () => {
    expect(deliveryStatus(row({ finishedAt: later(1) }), later(2))).toBe("sent");
    expect(deliveryStatus(row({ finishedAt: later(1), missedIds: ["a", "b"] }), later(2))).toBe("failed");
  });

  it("is failed if it's still sending 15 minutes on, since the send must have been cut off", () => {
    expect(deliveryStatus(row(), later(14))).toBe("sending");
    expect(deliveryStatus(row(), later(15))).toBe("failed");
  });
});

describe("deliveryProgress", () => {
  const name = (id: string) => id.toUpperCase();

  it("names who was missed", () => {
    const progress = deliveryProgress(row({ finishedAt: later(1), reachedIds: ["a"], missedIds: ["b"] }), ["a", "b"], name, later(2));
    expect(progress).toEqual({ status: "failed", total: 2, sent: 1, missed: ["B"] });
  });

  it("counts everyone not reached as missed when the send was cut off", () => {
    const progress = deliveryProgress(row({ reachedIds: ["a"] }), ["a", "b", "c"], name, later(15));
    expect(progress).toEqual({ status: "failed", total: 3, sent: 1, missed: ["B", "C"] });
  });
});

describe("retrying", () => {
  it("only a failed send can be retried", () => {
    expect(canRetry(row(), later(1))).toBe(false);
    expect(canRetry(row({ finishedAt: later(1) }), later(2))).toBe(false);
    expect(canRetry(row({ finishedAt: later(1), missedIds: ["a"] }), later(2))).toBe(true);
  });

  it("restarts the clock and forgets who was missed", () => {
    expect(restart(later(5))).toEqual({ finishedAt: null, missedIds: [], createdAt: later(5) });
  });

  it("only has those not yet reached still to reach", () => {
    expect(stillToReach(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("finish adds who this go reached to who earlier goes did, and misses the rest", () => {
    expect(finish(["a", "b", "c"], ["a"], ["b"], later(1))).toEqual({ reachedIds: ["a", "b"], missedIds: ["c"], finishedAt: later(1) });
  });
});

describe("deliverEach", () => {
  it("carries on past a failure and skips those it returns undefined for", async () => {
    const onError = vi.fn();
    const reached = await deliverEach(
      ["a", "b", "c", "d"],
      async (id) => {
        if (id === "b") throw new Error("bounced");
        if (id === "c") return undefined;
        return id.toUpperCase();
      },
      onError,
    );
    expect(reached).toEqual([
      { recipient: "a", outcome: "A" },
      { recipient: "d", outcome: "D" },
    ]);
    expect(onError).toHaveBeenCalledWith("b", expect.any(Error));
  });
});
