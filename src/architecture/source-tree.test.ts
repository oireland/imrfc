import { globSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { findBoundaryViolations } from "./feature-boundaries";

it("no feature imports another feature's internals", () => {
  const files = globSync("src/features/**/*.{ts,tsx}").map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  }));

  expect(findBoundaryViolations(files)).toEqual([]);
});
