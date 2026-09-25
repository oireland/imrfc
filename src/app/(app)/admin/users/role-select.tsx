"use client";

import type { Role } from "@/features/users";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const ROLES: Role[] = ["member", "committee", "admin"];

export function RoleSelect({
  userId,
  userName,
  role,
}: {
  userId: string;
  userName: string;
  role: Role;
}) {
  return (
    <>
      <input type="hidden" name="userId" value={userId} />
      <NativeSelect
        name="role"
        defaultValue={role}
        size="sm"
        aria-label={`Role for ${userName}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {ROLES.map((r) => (
          <NativeSelectOption key={r} value={r}>
            {r}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </>
  );
}
