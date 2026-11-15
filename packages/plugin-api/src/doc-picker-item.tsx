import type { PickerItem } from "@lydie/ui";

import { DocIcon } from "./page-icon.tsx";

// A document as a row of a `PickerDialog` (palette, quick switcher, link pickers): its title and
// icon, so documents look the same in every list. `properties` gives the page icon when known.
export function docPickerItem(
  doc: { id: string; title: string; properties?: Record<string, unknown> | null },
  extra: Partial<PickerItem> = {},
): PickerItem {
  return {
    id: doc.id,
    title: doc.title || "Untitled",
    icon: <DocIcon id={doc.id} properties={doc.properties ?? null} />,
    ...extra,
  };
}
