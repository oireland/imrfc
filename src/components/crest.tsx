import Image from "next/image";
import crest from "../../docs/brand/crest.png";

/** The club crest on its white tile (the artwork has a white background). */
export function Crest({ className = "size-16" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-full bg-tile p-2 shadow-card ring-1 ring-black/5 ${className}`}>
      <Image src={crest} alt="Imperial Medicals RFC" className="size-full object-contain" priority />
    </span>
  );
}
