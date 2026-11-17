import { createEquipmentUnit } from "@/features/equipment";
import { addToChecklist } from "@/features/checklists";
import { claimDuty, ensureDuties } from "@/features/duties";
import { asc, gt } from "drizzle-orm";
import { createEvents, event, listTeams, type NewEvent } from "@/features/events";
import { createStore } from "@/features/stores";
import { user } from "@/features/users";
import type { createTestDb } from "./db";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const DAY = 86_400_000;
const at = (day: Date, hour: number, minute = 0) =>
  new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute));

/**
 * A realistic season, the one `docs/performance-report.md` measured: 40 Users, 12 Equipment
 * Units, default Checklists for Training and Matches, Training on Tuesdays and Thursdays and a
 * Saturday Match from about 38 weeks ago to 35 weeks ahead (~114 past, ~106 upcoming), and
 * 6 Duties for the measured User. Built relative to `now` so the split stays the same.
 */
export async function seedSeason(db: TestDb, now = new Date()) {
  await db.insert(user).values(
    Array.from({ length: 40 }, (_, i) => ({
      id: `user-${i}`,
      name: `Player ${i}`,
      email: `player${i}@example.org`,
      accessState: "approved" as const,
      role: i === 0 ? ("committee" as const) : ("member" as const),
    })),
  );
  const me = "user-0";

  const shed = await createStore(db, { name: "Shed", address: "Harlington" });
  if (!shed.ok) throw new Error(shed.error);
  const units = [];
  for (let i = 0; i < 12; i++) {
    const made = await createEquipmentUnit(db, { name: `Kit ${i}`, homeId: shed.store.id, quantity: i % 3 === 0 ? 4 : 1 });
    if (!made.ok) throw new Error(made.error);
    units.push(made.equipmentUnit);
  }
  for (const unit of units.slice(0, 6)) await addToChecklist(db, { scope: "event_type", scopeId: "training" }, unit.id);
  for (const unit of units.slice(3, 10)) await addToChecklist(db, { scope: "event_type", scopeId: "match" }, unit.id);

  const [team] = await listTeams(db);
  const events: NewEvent[] = [];
  const startDay = new Date(now.getTime() - 38 * 7 * DAY);
  const endDay = new Date(now.getTime() + 35 * 7 * DAY);
  for (let day = startDay; day < endDay; day = new Date(day.getTime() + DAY)) {
    const weekday = day.getUTCDay();
    if (weekday === 2 || weekday === 4) {
      events.push({ eventType: "training", start: at(day, 19), end: at(day, 20, 30), venue: "Harlington" });
    } else if (weekday === 6) {
      events.push({
        eventType: "match",
        start: at(day, 14),
        end: at(day, 16),
        venue: "Harlington",
        matchDetails: { teamId: team.id, opponent: "Barts", homeAway: "home", competition: "bucs" },
      });
    }
  }
  const created = await createEvents(db, events);
  if (!created.ok) throw new Error(created.error);

  // My next three Events each get a To Duty and its From Duty: 6 Duties.
  const next = await db.select().from(event).where(gt(event.start, now)).orderBy(asc(event.start)).limit(3);
  for (const row of next) {
    const duties = await ensureDuties(db, row.id, [units[3].id]);
    for (const duty of duties) await claimDuty(db, duty.id, me);
  }

  return { userId: me, unitId: units[3].id, nextEventId: next[0].id };
}
