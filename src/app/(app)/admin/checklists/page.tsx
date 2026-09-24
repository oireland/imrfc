import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { listSeries } from "@/features/events";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

const EVENT_TYPES = ["training", "match", "social"] as const;

export default async function AdminChecklistsPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");
  const allSeries = await listSeries(db);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Default Checklists</h2>
      {EVENT_TYPES.map((type) => (
        <section key={type} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <h3 className="font-medium capitalize">{type}</h3>
          <ChecklistEditor
            target={{ scope: "event_type", scopeId: type }}
            path="/admin/checklists"
          />
        </section>
      ))}
      <h2 className="text-xl font-semibold">Series Checklists</h2>
      {allSeries.map((s) => (
        <section key={s.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <h3 className="font-medium">{s.title}</h3>
          <ChecklistEditor
            target={{ scope: "series", scopeId: s.id }}
            path="/admin/checklists"
            inheritedFrom="Default Checklist"
          />
        </section>
      ))}
    </div>
  );
}
