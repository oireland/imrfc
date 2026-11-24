// What client components may import: pure rules only, nothing that touches the database.
export { shareMessage } from "./share-rules";
export type { ShareEvent } from "./share-rules";
