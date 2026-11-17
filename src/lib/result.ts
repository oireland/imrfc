/** A failed outcome with a message that is safe to show. */
export type Failure = { ok: false; error: string };

/** Success (optionally carrying extra fields) or a Failure. */
export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | Failure;
