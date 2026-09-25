import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createKitUnit } from "@/features/kit";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { BackLink } from "@/components/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";

export default async function NewKitUnitPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const stores = (await listLocations(db)).filter((l: Location) => l.isStore);

  async function create(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current || !isCommitteeOrAbove(current.role)) redirect("/");
    const result = await createKitUnit(db, {
      name: String(formData.get("name")),
      homeId: String(formData.get("homeId")),
    });
    if (!result.ok) redirect(`/kit/new?error=${encodeURIComponent(result.error)}`);
    revalidatePath("/kit");
    redirect(`/kit/${result.kitUnit.id}?flash=kit-created`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/kit">Kit</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">New kit</h2>
      </div>

      <Card>
        <CardContent>
          <form action={create} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kit-name">Name</Label>
              <Input id="kit-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kit-home">Home</Label>
              <NativeSelect id="kit-home" name="homeId" required className="w-full">
                <NativeSelectOption value="">Choose a store…</NativeSelectOption>
                {stores.map((s: Location) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">Where it lives, and where it goes back to after an event.</p>
            </div>
            <SubmitButton pendingLabel="Adding…">Add kit</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
