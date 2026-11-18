// Joining a list into a sentence, the way a teammate would say it:
// "Tom & Sam", "Tom, Sam & Priya". Pure, no database or Next.js.

export function joinList(items: string[], and: "&" | "and" = "&"): string {
  if (items.length <= 2) return items.join(` ${and} `);
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
