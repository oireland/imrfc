// Joining several People's names into a sentence, the way a teammate would say it:
// "Tom & Sam", "Tom, Sam & Priya". Pure, no database or Next.js.

export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
