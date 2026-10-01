import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { listSeries } from "@/features/events";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";

const EVENT_TYPES = ["training", "match", "social"] as const;

export default async function AdminChecklistsPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");
  const allSeries = await listSeries(db);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Checklists</h2>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Default lists</h3>
        {EVENT_TYPES.map((type) => (
          <Card key={type}>
            <CardContent>
              <ChecklistEditor
                title={type[0].toUpperCase() + type.slice(1)}
                target={{ scope: "event_type", scopeId: type }}
                path="/admin/checklists"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Series lists</h3>
        {allSeries.map((s) => (
          <Card key={s.id}>
            <CardContent>
              <ChecklistEditor
                title={s.title}
                target={{ scope: "series", scopeId: s.id, inherits: { seriesId: null, eventType: s.eventType } }}
                path="/admin/checklists"
                inheritedFrom="the default list"
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
