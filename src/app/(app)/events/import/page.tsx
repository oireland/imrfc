import { Download } from "lucide-react";
import { db } from "@/db/client";
import { EVENT_CSV_COLUMNS, MAX_EVENTS_PER_IMPORT, eventCsvTemplate, listTeams } from "@/features/events";
import { requireCommittee } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { importEvents } from "./actions";
import { CsvFormatDialog } from "./csv-format-dialog";
import { ImportEventsForm } from "./import-events-form";

export default async function ImportEventsPage() {
  await requireCommittee();

  const teams = await listTeams(db);
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(eventCsvTemplate())}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/events">Events</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Import events</h2>
      </div>
      <p className="text-muted-foreground">
        Add a whole fixture list or term of socials at once from a spreadsheet saved as CSV. The first row must be the header row
        with the column names.
      </p>

      <div className="flex flex-col gap-2">
        <a href={template} download="events-template.csv" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
          <Download aria-hidden="true" />
          Download the template
        </a>
        <CsvFormatDialog
          columns={EVENT_CSV_COLUMNS}
          teams={teams.map((t) => t.name)}
          maxEvents={MAX_EVENTS_PER_IMPORT}
        />
      </div>

      <Card>
        <CardContent>
          <ImportEventsForm action={importEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
