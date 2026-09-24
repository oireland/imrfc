import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { groupByWhereabouts, listKitUnits, recordMove, type KitUnit } from "@/features/kit";
import { markUnconfirmed } from "@/features/duties";
import { getEvent } from "@/features/events";
import { listApprovedUsers } from "@/features/users";
import { listLocations, type Location } from "@/features/locations";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-base leading-snug font-medium";

export default async function KitViewPage() {
  const user = await requireApprovedUser();

  await markUnconfirmed(db);
  const [allUnits, locations, people] = await Promise.all([
    listKitUnits(db, { includeRetired: true }),
    listLocations(db),
    listApprovedUsers(db),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const lastSeen = new Map<string, string>();
  for (const eventId of new Set(allUnits.flatMap((u: KitUnit) => (u.lastSeenEventId ? [u.lastSeenEventId] : [])))) {
    lastSeen.set(eventId as string, (await getEvent(db, eventId as string))?.title ?? "an Event");
  }
  const locationsById = new Map(locations.map((l: Location) => [l.id, l]));
  const activeUnits = allUnits.filter((u: KitUnit) => u.status === "active");
  const inactiveUnits = allUnits.filter((u: KitUnit) => u.status !== "active");
  const groups = groupByWhereabouts(activeUnits);
  const stores = locations.filter((l: Location) => l.isStore);

  async function iveGotIt(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, String(formData.get("kitUnitId")), userId, {
      type: "holder",
      holderId: userId,
    });
    revalidatePath("/kit");
  }

  async function putInStore(formData: FormData) {
    "use server";
    const { id: userId } = await requireApprovedUser();
    await recordMove(db, String(formData.get("kitUnitId")), userId, {
      type: "store",
      storeId: String(formData.get("storeId")),
    });
    revalidatePath("/kit");
  }

  function KitRow({ unit }: { unit: KitUnit }) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <Link href={`/kit/${unit.id}`} className="flex items-center justify-between gap-2">
          <span className="font-medium">{unit.name}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        {unit.whereaboutsType === "unconfirmed" && unit.lastSeenEventId && (
          <p className="text-xs text-muted-foreground">Last seen at {lastSeen.get(unit.lastSeenEventId)}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <form action={iveGotIt}>
            <input type="hidden" name="kitUnitId" value={unit.id} />
            <SubmitButton size="sm" variant="secondary">
              I&apos;ve got it
            </SubmitButton>
          </form>
          <form action={putInStore} className="flex items-center gap-2">
            <input type="hidden" name="kitUnitId" value={unit.id} />
            <NativeSelect name="storeId" size="sm" aria-label={`Put ${unit.name} in store`}>
              {stores.map((s: Location) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
            <SubmitButton size="sm" variant="secondary">
              Put in store
            </SubmitButton>
          </form>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Kit</h2>

      {groups.length === 0 && <p className="text-muted-foreground">No Kit Units yet.</p>}

      {groups.map((group) => (
        <Card key={group.type === "store" ? group.storeId : group.type === "holder" ? group.holderId : "unconfirmed"}>
          <CardHeader>
            <h3 className={CARD_TITLE_CLASS}>
              {group.type === "store"
                ? (locationsById.get(group.storeId)?.name ?? "Store")
                : group.type === "unconfirmed"
                  ? "Unconfirmed"
                  : group.holderId === user.id
                    ? "You"
                    : (personById.get(group.holderId)?.name ?? "Held")}
              {group.type === "holder" && personById.get(group.holderId)?.accessState === "blocked" && (
                <span className="ml-2 text-xs font-semibold text-destructive">with blocked user</span>
              )}
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {group.units.map((unit: KitUnit) => (
                <KitRow key={unit.id} unit={unit} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {inactiveUnits.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className={CARD_TITLE_CLASS}>Missing / Retired</h3>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {inactiveUnits.map((unit: KitUnit) => (
                <li key={unit.id}>
                  <Link
                    href={`/kit/${unit.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted"
                  >
                    <span className="font-medium">{unit.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{unit.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
