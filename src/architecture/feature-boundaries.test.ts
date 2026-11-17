import { describe, expect, it } from "vitest";
import { findBoundaryViolations, findFeatureCycles } from "./feature-boundaries";

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

describe("findBoundaryViolations outside the features", () => {
  it("reports a component reaching into a feature's internals", () => {
    const violations = findBoundaryViolations([
      { path: "src/components/board.tsx", source: `import { sortForShirt } from "@/features/selection/shirts";` },
      { path: "src/lib/auth.ts", source: `import { user } from "../features/users/schema";` },
    ]);

    expect(violations).toEqual([
      { file: "src/components/board.tsx", imports: "@/features/selection/shirts" },
      { file: "src/lib/auth.ts", imports: "../features/users/schema" },
    ]);
  });

  it("allows a feature's entry point and its client entry point", () => {
    const violations = findBoundaryViolations([
      {
        path: "src/components/board.tsx",
        source: [`import { listBoard } from "@/features/selection";`, `import { sortForShirt } from "@/features/selection/client";`].join("\n"),
      },
      { path: "src/features/events/ui.ts", source: `import { sortForShirt } from "@/features/selection/client";` },
    ]);

    expect(violations).toEqual([]);
  });
});

describe("findFeatureCycles", () => {
  const imports = (from: string, to: string) => ({ path: `src/features/${from}/index.ts`, source: `import { x } from "@/features/${to}";` });

  it("reports features that import each other, directly or through a third", () => {
    expect(findFeatureCycles([imports("a", "b"), imports("b", "a")])).toEqual([["a", "b", "a"]]);
    expect(findFeatureCycles([imports("a", "b"), imports("b", "c"), imports("c", "a")])).toEqual([["a", "b", "c", "a"]]);
  });

  it("allows features that only depend one way, and a feature's own imports", () => {
    expect(
      findFeatureCycles([imports("a", "b"), imports("a", "c"), imports("b", "c"), { path: "src/features/a/x.ts", source: `import { y } from "./y";` }]),
    ).toEqual([]);
  });

  it("ignores test files, which may reach across features freely", () => {
    expect(findFeatureCycles([imports("a", "b"), { path: "src/features/b/index.test.ts", source: `import { x } from "@/features/a";` }])).toEqual([]);
  });
});
