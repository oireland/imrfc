import { BackLink } from "@/components/back-link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { archiveStore, createStore, listStores, type Store } from "@/features/stores";
import { requireCommittee } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export default async function StoresPage() {
  await requireCommittee();

  const stores = await listStores(db);

  async function create(formData: FormData) {
    "use server";
    await requireCommittee();
    await createStore(db, { name: String(formData.get("name")), address: String(formData.get("address")) });
    revalidatePath("/stores");
  }

  async function archive(formData: FormData) {
    "use server";
    await requireCommittee();
    await archiveStore(db, String(formData.get("storeId")));
    revalidatePath("/stores");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Stores</h2>
      </div>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {stores.length === 0 && <p className="p-4 text-muted-foreground">No stores yet. Add wherever the equipment lives between events.</p>}
          {stores.map((s: Store) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex flex-col gap-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">{s.address}</p>
              </div>
              <form action={archive}>
                <input type="hidden" name="storeId" value={s.id} />
                <SubmitButton variant="outline" size="sm">
                  Archive
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a store</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={create} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-name">Name</Label>
              <Input id="store-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-address">Address</Label>
              <Input id="store-address" name="address" required />
            </div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
