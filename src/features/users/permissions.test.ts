import { describe, expect, it } from "vitest";
import { canDeleteAccount, canDeleteEvent, canManageUsers, isCommitteeOrAbove } from "./permissions";

describe("isCommitteeOrAbove", () => {
  it("is true for Committee and Admin, false for Member", () => {
    expect(isCommitteeOrAbove("committee")).toBe(true);
    expect(isCommitteeOrAbove("admin")).toBe(true);
    expect(isCommitteeOrAbove("member")).toBe(false);
  });
});

describe("canManageUsers", () => {
  it("is true only for Admin", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("committee")).toBe(false);
    expect(canManageUsers("member")).toBe(false);
  });
});

describe("canDeleteAccount", () => {
  it("lets anyone delete their own account", () => {
    expect(canDeleteAccount({ id: "tom", role: "member" }, { id: "tom", role: "member" })).toBe(true);
    expect(canDeleteAccount({ id: "ann", role: "admin" }, { id: "ann", role: "admin" })).toBe(true);
  });

  it("lets an Admin delete anyone who isn't an Admin", () => {
    expect(canDeleteAccount({ id: "ann", role: "admin" }, { id: "tom", role: "member" })).toBe(true);
    expect(canDeleteAccount({ id: "ann", role: "admin" }, { id: "cat", role: "committee" })).toBe(true);
    expect(canDeleteAccount({ id: "ann", role: "admin" }, { id: "bea", role: "admin" })).toBe(false);
  });

  it("doesn't let Committee or Members delete someone else", () => {
    expect(canDeleteAccount({ id: "cat", role: "committee" }, { id: "tom", role: "member" })).toBe(false);
    expect(canDeleteAccount({ id: "sam", role: "member" }, { id: "tom", role: "member" })).toBe(false);
  });
});

describe("canDeleteEvent", () => {
  it("is for Admins only", () => {
    expect(canDeleteEvent("admin")).toBe(true);
    expect(canDeleteEvent("committee")).toBe(false);
    expect(canDeleteEvent("member")).toBe(false);
  });
});
