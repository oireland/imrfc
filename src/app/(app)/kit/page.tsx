import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ChevronRight, CircleHelp, User, Warehouse } from "lucide-react";
import { db } from "@/db/client";
import { AddKitButton } from "@/components/add-kit-button";
import { Card } from "@/components/ui/card";
import { QuickMoveRowButton } from "@/components/quick-move-button";
import {
  getKitUnit,
  getPortions,
  groupByWhereabouts,
  listKitUnits,
  listPortionsFor,
  quickMoveFor,
  recordMove,
  type KitRow,
  type KitUnit,
  type WhereaboutsGroup,
} from "@/features/kit";
import { markUnconfirmed } from "@/features/duties";
import { getEvent } from "@/features/events";
import { displayName, isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { listStores, type Store } from "@/features/stores";
import { requireApprovedUser } from "@/lib/session";
import { addKitUnit } from "./actions";

export default async function KitViewPage() {
  const user = await requireApprovedUser();

  await markUnconfirmed(db);
  const [allUnits, stores, people] = await Promise.all([
    listKitUnits(db, { includeRetired: true }),
    listStores(db),
    listApprovedUsers(db),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const activeUnits = allUnits.filter((u: KitUnit) => u.status === "active");
  const inactiveUnits = allUnits.filter((u: KitUnit) => u.status !== "active");
  const portions = await listPortionsFor(db, activeUnits.map((u: KitUnit) => u.id));
  const lastSeenIds = [...new Set(portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])))];
  const lastSeenEvents = await Promise.all(lastSeenIds.map((id) => getEvent(db, id)));
  const lastSeen = new Map(lastSeenIds.map((id, i) => [id, lastSeenEvents[i]?.title ?? "an event"]));
  const storesById = new Map(stores.map((s: Store) => [s.id, s]));
  const storeName = (id: string) => storesById.get(id)?.name ?? "Store";
  const unitsById = new Map(activeUnits.map((u: KitUnit) => [u.id, u]));
  const rows: KitRow[] = portions
    .filter((p) => unitsById.has(p.kitUnitId))
    .map((p) => ({ unit: unitsById.get(p.kitUnitId)!, portion: p }));
  const groups = groupByWhereabouts(rows, user.id);

  async function quickMove(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    const kitUnitId = String(formData.get("kitUnitId"));
    const portionId = String(formData.get("portionId"));
    const [unit, unitPortions] = await Promise.all([getKitUnit(db, kitUnitId), getPortions(db, kitUnitId)]);
    const portion = unitPortions.find((p) => p.id === portionId);
    if (!unit || !portion) return;
    const count = formData.get("count");
    const move = quickMoveFor({ unit, portion }, userId, count ? Number(count) : undefined);
    await recordMove(db, kitUnitId, userId, move.to, "ad_hoc", { count: move.count, from: move.from });
    revalidatePath("/kit");
  }

  function groupHeading(group: WhereaboutsGroup) {
    if (group.type === "store") {
      return { icon: Warehouse, title: storeName(group.storeId), kind: "In store" };
    }
    if (group.type === "unconfirmed") {
      return { icon: CircleHelp, title: "Not confirmed", kind: "Nobody confirmed where these went" };
    }
    const holder = personById.get(group.holderId);
    return {
      icon: User,
      title: group.holderId === user.id ? "With you" : `With ${holder ? displayName(holder) : "someone"}`,
      kind: holder?.accessState === "blocked" ? "Blocked user" : undefined,
      blocked: holder?.accessState === "blocked",
    };
  }

  function KitRowItem({ row }: { row: KitRow }) {
    const { unit, portion } = row;
    const move = quickMoveFor(row, user.id);
    const split = unit.quantity > 1;
    const name = split ? `${unit.name} ×${portion.count}` : unit.name;
    const detail =
      portion.whereaboutsType === "unconfirmed" && portion.lastSeenEventId
        ? `Last seen at ${lastSeen.get(portion.lastSeenEventId)}`
        : unit.conditionNote || null;
    return (
      <li className="relative flex items-center gap-3 px-4 py-3 has-[a:hover]:bg-muted/60">
        <Link
          href={`/kit/${unit.id}`}
          className="flex min-w-0 flex-1 flex-col after:absolute after:inset-0 after:content-['']"
        >
          <span className="truncate font-medium">{name}</span>
          {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
        </Link>
        <QuickMoveRowButton
          action={quickMove}
          fields={{ kitUnitId: unit.id, portionId: portion.id }}
          available={split ? portion.count : 1}
          returnTo={move.to.type === "store" ? storeName(move.to.storeId) : null}
          name={name}
        />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Kit</h2>
        <p className="text-sm text-muted-foreground">Where everything is right now. Tap anything to see its history.</p>
      </div>

      {groups.length === 0 && <p className="text-muted-foreground">No kit yet.</p>}

      {groups.map((group) => {
        const { icon: Icon, title, kind, blocked } = groupHeading(group);
        const key = group.type === "store" ? group.storeId : group.type === "holder" ? group.holderId : "unconfirmed";
        return (
          <section key={key} aria-labelledby={`group-${key}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-1">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${group.type === "holder" && group.holderId === user.id ? "bg-accent text-accent-foreground" : "bg-card text-foreground shadow-card"}`}
              >
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 id={`group-${key}`} className="truncate font-heading text-[22px] leading-tight">
                  {title}
                </h3>
                <span className={blocked ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>
                  {kind && `${kind} · `}{group.rows.length} {group.rows.length === 1 ? "item" : "items"}
                </span>
              </div>
            </div>
            <Card className="py-0">
              <ul className="divide-y divide-border">
                {group.rows.map((row) => (
                  <KitRowItem key={`${row.unit.id}:${row.portion.id}`} row={row} />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}

      {inactiveUnits.length > 0 && (
        <section aria-labelledby="group-inactive" className="flex flex-col gap-2">
          <h3 id="group-inactive" className="px-1 font-heading text-[22px] leading-tight text-muted-foreground">
            Missing / Retired
          </h3>
          <Card className="py-0">
            <ul className="divide-y divide-border">
              {inactiveUnits.map((unit: KitUnit) => (
                <li key={unit.id}>
                  <Link
                    href={`/kit/${unit.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60"
                  >
                    <span className="font-medium">{unit.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{unit.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {isCommitteeOrAbove(user.role) && <AddKitButton stores={stores.map((s: Store) => ({ id: s.id, name: s.name }))} action={addKitUnit} />}
    </div>
  );
}
