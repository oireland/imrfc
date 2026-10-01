"use client";

import { AddEquipmentButton, EditToggle, KitRow, ResetLink, useKitEditing, type KitEditing, type KitItem } from "@/components/kit-editing";

/** A kit list with no Duties on it (a Default or Series list), editable the same way as an Event's. */
export function PlainKitList({ title, items, kit, note }: { title: string; items: KitItem[]; kit: KitEditing; note?: string }) {
  const editing = useKitEditing(kit);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-[22px] leading-tight">{title}</h3>
        <EditToggle state={editing} />
      </div>
      {note && <p className="text-muted-foreground">{note}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.equipmentUnitId} className="py-2 first:pt-0">
            <KitRow item={item} state={editing}>
              <span className="font-heading text-lg leading-none">
                {item.name}
                {item.quantity > 1 && ` ×${item.count}`}
              </span>
            </KitRow>
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-muted-foreground">Nothing on the list yet.</li>}
      </ul>
      <ResetLink state={editing} kit={kit} />
      <AddEquipmentButton state={editing} />
      {editing.sheets}
    </div>
  );
}
