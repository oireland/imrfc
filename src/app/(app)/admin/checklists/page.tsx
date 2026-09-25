import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { listSeries } from "@/features/events";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            <CardHeader>
              <CardTitle className="capitalize">{type}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistEditor
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
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistEditor
                target={{ scope: "series", scopeId: s.id }}
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
