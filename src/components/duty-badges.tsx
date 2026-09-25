import { Check, CircleAlert, Star, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/** A Duty with nobody assigned yet. */
export function UnassignedBadge() {
  return (
    <Badge variant="destructive">
      <CircleAlert aria-hidden="true" />
      Unassigned
    </Badge>
  );
}

/** A Duty that has been Confirmed. */
export function ConfirmedBadge() {
  return (
    <Badge variant="secondary">
      <Check aria-hidden="true" />
      Confirmed
    </Badge>
  );
}

/** A Clash warning marker. */
export function ClashBadge() {
  return (
    <Badge variant="destructive">
      <TriangleAlert aria-hidden="true" />
      Clash
    </Badge>
  );
}

/** Marks a Duty as belonging to the signed-in User. */
export function YourDutyBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("bg-accent text-accent-foreground", className)}>
      <Star aria-hidden="true" />
      Your Duty
    </Badge>
  );
}
