/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wraps a test db so that, inside a transaction, inserting into `table` throws. Lets a test
 * prove that the writes made before the failure were rolled back.
 */
export function failOnInsert<Db extends { transaction: (...args: any[]) => any }>(db: Db, table: unknown): Db {
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (fn: (tx: any) => Promise<unknown>) =>
        target.transaction((tx: any) =>
          fn(
            new Proxy(tx, {
              get: (t, k, r) =>
                k === "insert"
                  ? (into: unknown) => {
                      if (into === table) throw new Error("boom");
                      return t.insert(into);
                    }
                  : Reflect.get(t, k, r),
            }),
          ),
        );
    },
  });
}
