import { describe, expect, it } from "vitest";
import { canAccessApp, canManageUsers, isCommitteeOrAbove } from "./permissions";

describe("canAccessApp", () => {
  it("is true only for an Approved Access State", () => {
    expect(canAccessApp("approved")).toBe(true);
    expect(canAccessApp("pending")).toBe(false);
    expect(canAccessApp("blocked")).toBe(false);
  });
});

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
