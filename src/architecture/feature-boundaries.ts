import { posix } from "node:path";

export type SourceFile = { path: string; source: string };
export type BoundaryViolation = { file: string; imports: string };

const importSpecifier = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const featurePath = /^src\/features\/([^/]+)(\/.*)?$/;

/**
 * A feature may import another feature only through its entry point
 * (`@/features/<name>`), never its internals. See docs/adr/0002.
 */
export function findBoundaryViolations(files: SourceFile[]): BoundaryViolation[] {
  return files.flatMap((file) => {
    const feature = file.path.match(featurePath)?.[1];
    if (!feature) return [];
    return [...file.source.matchAll(importSpecifier)]
      .map((match) => match[1])
      .filter((specifier) => {
        const target = resolve(file.path, specifier)?.match(featurePath);
        return target && target[1] !== feature && target[2];
      })
      .map((specifier) => ({ file: file.path, imports: specifier }));
  });
}

function resolve(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith(".")) return posix.join(posix.dirname(fromFile), specifier);
  return undefined;
}
