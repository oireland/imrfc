import type { EventType } from "@/features/events";

export type ComingUpView = { view: "calendar" | "agenda"; type: EventType | null };

const TYPES: readonly string[] = ["training", "match", "social"] satisfies EventType[];

/** What's coming up's view and Event Type filter, from the page's query (`?view=agenda&type=match`) so both can be bookmarked. */
export function readComingUpView(params: URLSearchParams): ComingUpView {
  const type = params.get("type");
  return {
    view: params.get("view") === "agenda" ? "agenda" : "calendar",
    type: type && TYPES.includes(type) ? (type as EventType) : null,
  };
}

/** The query string for `next`, keeping any other params and leaving defaults out. */
export function comingUpSearch(current: URLSearchParams, next: ComingUpView): string {
  const params = new URLSearchParams(current);
  params.delete("view");
  params.delete("type");
  if (next.view !== "calendar") params.set("view", next.view);
  if (next.type) params.set("type", next.type);
  const query = params.toString();
  return query ? `?${query}` : "";
}
