import { Input } from "@/components/ui/input";

/** A free-text Venue box that suggests venues already used, so "Harlington" gets typed the same way each time. */
export function VenueInput({ suggestions, ...props }: React.ComponentProps<"input"> & { id: string; suggestions: string[] }) {
  const listId = `${props.id}-suggestions`;
  return (
    <>
      <Input list={listId} autoComplete="off" placeholder="e.g. Harlington, or an away ground's address" {...props} />
      <datalist id={listId}>
        {suggestions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  );
}
