// The panel's building blocks. Rows have the document tree's form (its `DocumentTree.tsx` rows):
// 30 px tall in a 32 px slot, rounded-lg, 13 px medium gray-600 names, a 16 px icon in a 20 px box,
// gray-950/3 on hover and /5 while open, its focus ring. Keep the two in step.
import { TYPE_LABELS, TypeIcon } from "@lydie/plugin-api/databases";
import type { PropertyType } from "@lydie/plugin-api/databases";
import {
  Button,
  focusRingInsetClass,
  sidebarItemStyles,
  sidebarSectionTitleClass,
} from "@lydie/plugin-api/ui";
import type { Icon } from "@lydie/plugin-api/ui";
import type { ReactNode } from "react";

export const focusable = focusRingInsetClass;

// A tree row: the property name, "Add property". The shared sidebar row recipe on a plain
// `<button>` (a row, not a button: Button's look would not match the tree). `aria-expanded` is set
// by a popover trigger.
export const treeRow = sidebarItemStyles({
  className: `mb-0 min-w-0 gap-1 px-2 text-left aria-expanded:bg-gray-950/5 aria-expanded:text-gray-900 ${focusable}`,
});

// The tree's icon box (`-ml-1 size-5`), so icons sit where the tree's page icons do. With the
// row's `px-2` and `gap-1` a 16 px icon has 6 px on either side.
export function IconBox({ children }: { children: ReactNode }) {
  return (
    <span className="-ml-1 flex size-5 shrink-0 items-center justify-center text-gray-500">
      {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className={`px-2 pt-2 pb-1 ${sidebarSectionTitleClass}`}>{children}</p>;
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-gray-950/6" />;
}

export function MenuAction({
  icon: Glyph,
  danger = false,
  onPress,
  children,
}: {
  icon: Icon;
  danger?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={danger ? "destructive" : "ghost"}
      size="md"
      onPress={onPress}
      className={`w-full justify-start px-2 ${danger ? "" : "text-gray-800"}`}
    >
      <Glyph aria-hidden className="size-3.5" />
      {children}
    </Button>
  );
}

// Every type at a glance, two to a row; arrow keys move between them.
export function TypeGrid({
  types,
  value,
  onPick,
  isDisabled,
}: {
  types: readonly PropertyType[];
  value: PropertyType | null;
  onPick: (type: PropertyType) => void;
  isDisabled?: (type: PropertyType) => boolean;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys move between the type buttons inside
    <fieldset
      aria-label="Property type"
      className="grid min-w-0 grid-cols-2 gap-0.5"
      onKeyDown={(event) => {
        const step = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-type]:enabled"),
        ];
        const next = items[items.indexOf(document.activeElement as HTMLButtonElement) + step];
        if (!next) return;
        event.preventDefault();
        next.focus();
      }}
    >
      {types.map((type) => (
        <Button
          key={type}
          variant="ghost"
          size="md"
          data-type={type}
          data-current={value === type || undefined}
          aria-pressed={value === type}
          isDisabled={isDisabled?.(type) ?? false}
          onPress={() => onPick(type)}
          className="min-w-0 justify-start px-2 text-gray-800"
        >
          <TypeIcon type={type} aria-hidden className="size-3.5 text-gray-500" />
          <span className="truncate">{TYPE_LABELS[type]}</span>
        </Button>
      ))}
    </fieldset>
  );
}
