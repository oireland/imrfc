import { describe, expect, it } from "vitest";
import { resolveNewUser } from "./access";

describe("resolveNewUser", () => {
  it("gives an Admin Role and Approved Access State to an ADMIN_EMAILS address", () => {
    const result = resolveNewUser("chair@imrfc.club", ["chair@imrfc.club"]);

    expect(result).toEqual({ role: "admin", accessState: "approved" });
  });

  it("gives a Member Role and Pending Access State to any other address", () => {
    const result = resolveNewUser("newplayer@example.com", ["chair@imrfc.club"]);

    expect(result).toEqual({ role: "member", accessState: "pending" });
  });
});
