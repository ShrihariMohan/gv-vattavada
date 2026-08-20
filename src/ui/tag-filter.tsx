"use client";

import { MENU_FILTER_TAGS } from "@/marketing/menu";
import { Button } from "@/components/ui/button";

export function TagFilter({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (tag: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant={!selected ? "default" : "outline"} type="button" onClick={() => onChange(null)}>
        All
      </Button>
      {MENU_FILTER_TAGS.map((t) => (
        <Button
          key={t}
          size="sm"
          type="button"
          variant={selected === t ? "default" : "outline"}
          className="capitalize"
          onClick={() => onChange(t)}
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
