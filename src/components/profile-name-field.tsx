"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Result } from "@/lib/result";


/** Profile's name field; saves when you leave it or press Enter, if it changed. */
export function ProfileNameField({ initialName, save }: { initialName: string; save: (name: string) => Promise<Result> }) {
  const saved = useRef(initialName);
  const [, startTransition] = useTransition();

  function commit(input: HTMLInputElement) {
    const name = input.value.trim();
    if (name === saved.current.trim()) return;
    if (!name) {
      input.value = saved.current;
      return;
    }
    startTransition(async () => {
      const result = await save(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      saved.current = name;
      toast.success("Name saved", { id: "name-saved" });
    });
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        commit(e.currentTarget.elements.namedItem("name") as HTMLInputElement);
      }}
    >
      <Label htmlFor="profile-name">Your name</Label>
      {!initialName.trim() && (
        <p className="text-xs text-muted-foreground">Add your name so teammates know who has the equipment.</p>
      )}
      <Input
        id="profile-name"
        name="name"
        defaultValue={initialName}
        required
        autoComplete="name"
        enterKeyHint="done"
        onBlur={(e) => commit(e.currentTarget)}
      />
    </form>
  );
}
