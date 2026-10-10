import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { user } from "@/features/users";
import { clearMobileNumber, getMobileNumber, hasMobileNumber, listMobileNumbers, setMobileNumber } from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "member" },
    { id: "sam", name: "Sam Roe", email: "sam@x.org", accessState: "approved", role: "member" },
    { id: "cat", name: "Cat Jones", email: "cat@x.org", accessState: "approved", role: "committee" },
    { id: "ann", name: "Ann Lee", email: "ann@x.org", accessState: "approved", role: "admin" },
  ]);
  return db;
}

const viewer = (id: string, role: "member" | "committee" | "admin") => ({ id, role });
const TOM = viewer("tom", "member");
const SAM = viewer("sam", "member");
const CAT = viewer("cat", "committee");
const ANN = viewer("ann", "admin");

describe("setMobileNumber", () => {
  it("stores the number as E.164 and lets the User read it back", async () => {
    const db = await setup();

    expect(await setMobileNumber(db, TOM, "tom", "07912 345678")).toEqual({ ok: true });

    expect(await getMobileNumber(db, TOM, "tom")).toBe("+447912345678");
  });

  it("replaces an earlier number", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");

    await setMobileNumber(db, TOM, "tom", "+33 6 12 34 56 78");

    expect(await getMobileNumber(db, TOM, "tom")).toBe("+33612345678");
  });

  it("clears the number when given nothing", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");

    expect(await setMobileNumber(db, TOM, "tom", "")).toEqual({ ok: true });

    expect(await getMobileNumber(db, TOM, "tom")).toBeNull();
    expect(await hasMobileNumber(db, "tom")).toBe(false);
  });

  it("refuses an invalid number and keeps the old one", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");

    expect(await setMobileNumber(db, TOM, "tom", "12345")).toMatchObject({ ok: false });

    expect(await getMobileNumber(db, TOM, "tom")).toBe("+447912345678");
  });

  it("lets Committee set someone's number, but not another member", async () => {
    const db = await setup();

    expect(await setMobileNumber(db, CAT, "tom", "07912 345678")).toEqual({ ok: true });
    expect(await setMobileNumber(db, SAM, "tom", "07912 000000")).toEqual({
      ok: false,
      error: "Only Committee can change someone else's number.",
    });

    expect(await getMobileNumber(db, ANN, "tom")).toBe("+447912345678");
  });
});

describe("who can read a Mobile number", () => {
  it("shows it to Committee, Admins and the User, and to nobody else", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");

    expect(await getMobileNumber(db, CAT, "tom")).toBe("+447912345678");
    expect(await getMobileNumber(db, ANN, "tom")).toBe("+447912345678");
    expect(await getMobileNumber(db, SAM, "tom")).toBeNull();
  });

  it("lists numbers for a batch of Users, leaving out Users with none and everything a member can't see", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");
    await setMobileNumber(db, SAM, "sam", "+33 6 12 34 56 78");

    const forCommittee = await listMobileNumbers(db, CAT, ["tom", "sam", "cat"]);
    expect([...forCommittee]).toEqual([
      ["tom", "+447912345678"],
      ["sam", "+33612345678"],
    ]);
    expect([...(await listMobileNumbers(db, TOM, ["tom", "sam"]))]).toEqual([["tom", "+447912345678"]]);
    expect((await listMobileNumbers(db, CAT, [])).size).toBe(0);
  });
});

describe("clearMobileNumber", () => {
  it("wipes the number whoever is asking, e.g. when an account is deleted", async () => {
    const db = await setup();
    await setMobileNumber(db, TOM, "tom", "07912 345678");

    await clearMobileNumber(db, "tom");

    expect(await hasMobileNumber(db, "tom")).toBe(false);
  });
});
