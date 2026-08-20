import { cn } from "@/lib/utils";

/** Unused placeholder card kept for rental pages until fleet photos exist. */
export function PhotoSlotCard({
  slot,
}: {
  slot: { label: string; hint: string; className?: string };
}) {
  return (
    <figure
      className={cn(
        "flex min-h-44 flex-col justify-between rounded-2xl bg-photo-slot p-4 text-photo-slot-fg ring-1 ring-foreground/8",
        slot.className,
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.18em]">Photo later</span>
      <figcaption>
        <p className="font-medium text-foreground">{slot.label}</p>
        <p className="mt-1 text-sm">{slot.hint}</p>
      </figcaption>
    </figure>
  );
}
