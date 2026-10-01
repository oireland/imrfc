"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Download, RotateCcw } from "lucide-react";
import type { FieldEdit, FieldKey, Role, TeamSheet } from "@/features/selection";
// Plain TypeScript, so the preview rebuilds on every keystroke without a round trip.
import { ROLES, ROLE_NAMES, buildSheet, type SheetFields } from "@/features/selection/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: true } | { ok: false; error: string };
type Actions = {
  save: (eventId: string, fields: Partial<Record<FieldKey, FieldEdit>>) => Promise<Result>;
  roles: (eventId: string, shirt: number, roles: Role[]) => Promise<Result>;
};

const FIELDS: { key: FieldKey; label: string; long?: boolean; defaultable?: boolean; hint?: string }[] = [
  { key: "title", label: "Title" },
  { key: "kickoff", label: "Kick-off" },
  { key: "meet", label: "Meet", hint: "Free text, e.g. “8.30am coach from SK or 8.45am coach from Hammersmith”" },
  { key: "location", label: "Location" },
  { key: "schedule", label: "Schedule", hint: "e.g. “Changing rooms 10.15am, warm up 10.30am”" },
  { key: "travelAttire", label: "Travel attire", defaultable: true },
  { key: "warmUpAttire", label: "Warm up attire", defaultable: true },
  { key: "postMatchActivity", label: "Post match", defaultable: true },
  { key: "message", label: "Message", long: true, defaultable: true },
];

export function TeamSheetEditor({ sheet, actions }: { sheet: TeamSheet; actions: Actions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, sheet.fields[f.key].value])) as SheetFields);
  const [asDefault, setAsDefault] = useState<Partial<Record<FieldKey, boolean>>>({});

  const preview = buildSheet({ date: sheet.date, fields: values, shirts: sheet.people });
  const dirty = FIELDS.some((f) => values[f.key] !== sheet.fields[f.key].value || asDefault[f.key]);

  function saveFields() {
    const edits: Partial<Record<FieldKey, FieldEdit>> = {};
    for (const f of FIELDS) {
      const value = values[f.key];
      const base = sheet.fields[f.key].base;
      edits[f.key] = { value, use: value === base ? "base" : asDefault[f.key] && sheet.hasTeam ? "save" : "override" };
    }
    startTransition(async () => {
      const result = await actions.save(sheet.eventId, edits);
      if (!result.ok) return void toast.error(result.error);
      setAsDefault({});
      toast.success("Team sheet saved");
      router.refresh();
    });
  }

  function toggleRole(shirt: number, current: Role[], role: Role) {
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    startTransition(async () => {
      const result = await actions.roles(sheet.eventId, shirt, next);
      if (!result.ok) return void toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        {sheet.readOnly && <p className="rounded-2xl bg-muted px-4 py-2 text-sm">This match has started or is cancelled, so the sheet can’t be changed.</p>}

        {sheet.missing.length > 0 && (
          <div role="status" className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">What’s missing</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              {sheet.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <fieldset disabled={sheet.readOnly} className="flex flex-col gap-4">
          {FIELDS.map((f) => {
            const base = sheet.fields[f.key].base;
            const Control = f.long ? Textarea : Input;
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`sheet-${f.key}`} className="text-sm font-semibold">
                    {f.label}
                  </label>
                  {values[f.key] !== base && (
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, [f.key]: base }))}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="size-3" aria-hidden="true" />
                      {f.defaultable ? "Use the default" : "Follow the event"}
                    </button>
                  )}
                </div>
                <Control id={`sheet-${f.key}`} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                {f.defaultable && sheet.hasTeam && values[f.key] !== base && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(asDefault[f.key])} onChange={(e) => setAsDefault((d) => ({ ...d, [f.key]: e.target.checked }))} />
                    Save as the {sheet.label} default
                  </label>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={saveFields}
            disabled={!dirty || pending}
            className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save changes
          </button>
        </fieldset>

        <section aria-labelledby="roles-heading" className="flex flex-col gap-3">
          <h2 id="roles-heading" className="text-sm font-semibold">
            Match day roles
          </h2>
          {sheet.people.length === 0 && <p className="text-sm text-muted-foreground">Pick some players first, then give them roles here.</p>}
          {sheet.people.map((p) => (
            <div key={p.shirt} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm">
                <span className="font-semibold">{p.shirt}</span> {p.name}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLES.map((role) => {
                  const on = p.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${ROLE_NAMES[role]} for ${p.name}`}
                      title={ROLE_NAMES[role]}
                      disabled={sheet.readOnly || pending}
                      onClick={() => toggleRole(p.shirt, p.roles, role)}
                      className={cn("h-8 min-w-10 rounded-full border px-3 text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <article aria-label="Team sheet preview" className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-heading text-2xl leading-tight">{preview.title}</h2>
          <p className="text-sm text-muted-foreground">{preview.date}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {preview.details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="font-semibold">{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
          {preview.message && <p className="mt-3 text-sm">{preview.message}</p>}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-foreground text-left">
                <th className="w-10 py-1">No.</th>
                <th>Name</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.shirt} className="border-b border-border">
                  <td className="py-1">{r.shirt}</td>
                  <td>{r.name}</td>
                  <td>{r.roles}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">{preview.legend}</p>
        </article>
        <a
          href={`/events/${sheet.eventId}/team-sheet/pdf`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold"
        >
          <Download className="size-4" aria-hidden="true" />
          Download PDF
        </a>
        {dirty && <p className="text-xs text-muted-foreground">The PDF has the saved version; save your changes first.</p>}
      </div>
    </div>
  );
}
