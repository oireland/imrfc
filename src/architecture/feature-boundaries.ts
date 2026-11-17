import { posix } from "node:path";

export type SourceFile = { path: string; source: string };
export type BoundaryViolation = { file: string; imports: string };

const importSpecifier = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const featurePath = /^src\/features\/([^/]+)(\/.*)?$/;

/** The ways in: `index.ts`, and `client.ts` for the pure bits client components need. */
const entryPoints = new Set(["", "/client"]);

const isTest = (path: string) => /\.test\.tsx?$/.test(path);

/** Which features a file imports, as `[specifier, feature, subpath]`. Subpath is "" for the entry point. */
function featureImports(file: SourceFile) {
  return [...file.source.matchAll(importSpecifier)].flatMap((match) => {
    const target = resolve(file.path, match[1])?.match(featurePath);
    return target ? [{ specifier: match[1], feature: target[1], subpath: target[2] ?? "" }] : [];
  });
}

/**
 * Anything outside a feature (another feature, a component, a route, a test) may import it only
 * through its entry points, never its internals. See docs/adr/0002.
 */
export function findBoundaryViolations(files: SourceFile[]): BoundaryViolation[] {
  return files.flatMap((file) => {
    const own = file.path.match(featurePath)?.[1];
    return featureImports(file)
      .filter(({ feature, subpath }) => feature !== own && !entryPoints.has(subpath))
      .map(({ specifier }) => ({ file: file.path, imports: specifier }));
  });
}

/** Cycles between features (each as a path that ends where it starts), ignoring test files. */
export function findFeatureCycles(files: SourceFile[]): string[][] {
  const edges = new Map<string, Set<string>>();
  for (const file of files.filter((f) => !isTest(f.path))) {
    const own = file.path.match(featurePath)?.[1];
    if (!own) continue;
    for (const { feature } of featureImports(file)) {
      if (feature !== own) edges.set(own, (edges.get(own) ?? new Set()).add(feature));
    }
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const visit = (feature: string, trail: string[]) => {
    const at = trail.indexOf(feature);
    if (at >= 0) {
      const cycle = trail.slice(at);
      const key = [...cycle].sort().join();
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push([...cycle, feature]);
      }
      return;
    }
    for (const next of edges.get(feature) ?? []) visit(next, [...trail, feature]);
  };
  for (const feature of [...edges.keys()].sort()) visit(feature, []);
  return cycles;
}

function resolve(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith(".")) return posix.join(posix.dirname(fromFile), specifier);
  return undefined;
}
