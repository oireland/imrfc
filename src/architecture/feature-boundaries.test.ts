import { describe, expect, it } from "vitest";
import { findBoundaryViolations } from "./feature-boundaries";

describe("findBoundaryViolations", () => {
  it("reports a feature importing another feature's internals", () => {
    const violations = findBoundaryViolations([
      {
        path: "src/features/equipment/moves.ts",
        source: `import { roleOf } from "@/features/users/roles";`,
      },
    ]);

    expect(violations).toEqual([
      { file: "src/features/equipment/moves.ts", imports: "@/features/users/roles" },
    ]);
  });

  it("reports a relative import that reaches into another feature", () => {
    const violations = findBoundaryViolations([
      {
        path: "src/features/equipment/moves.ts",
        source: `import { roleOf } from "../users/roles";`,
      },
    ]);

    expect(violations).toEqual([
      { file: "src/features/equipment/moves.ts", imports: "../users/roles" },
    ]);
  });

  it("allows another feature's entry point and a feature's own internals", () => {
    const violations = findBoundaryViolations([
      {
        path: "src/features/equipment/moves.ts",
        source: [
          `import { roleOf } from "@/features/users";`,
          `import { locationName } from "../locations";`,
          `import { whereabouts } from "./whereabouts";`,
          `import { EquipmentStatus } from "@/features/equipment/status";`,
          `import { eq } from "drizzle-orm";`,
        ].join("\n"),
      },
    ]);

    expect(violations).toEqual([]);
  });
});
