// What client components may import: pure rules only, nothing that touches the database.
export { parsePlaceKey, placeKey, placeOf, samePlace } from "./portions";
export type { Place, Portion } from "./portions";
