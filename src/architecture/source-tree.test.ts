import { globSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { findBoundaryViolations, findFeatureCycles } from "./feature-boundaries";

// The architecture tests quote bad imports as strings, so they aren't scanned.
const files = globSync("src/**/*.{ts,tsx}")
  .filter((path) => !path.startsWith("src/architecture/"))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));

it("nothing imports a feature's internals, only its entry points", () => {
  expect(findBoundaryViolations(files)).toEqual([]);
});

it("no two features import each other, directly or through others", () => {
  expect(findFeatureCycles(files)).toEqual([]);
});
