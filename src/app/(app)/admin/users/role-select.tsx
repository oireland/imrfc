"use client";

import type { Role } from "@/features/users";

const ROLES: Role[] = ["member", "committee", "admin"];

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  return (
    <>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </>
  );
}
