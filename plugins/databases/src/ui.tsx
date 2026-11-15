// Small building blocks over @lydie/ui: a button that opens a popover, and a popover anchored to
// an element (cell editors).
import { EditorPopover } from "@lydie/plugin-api/databases";
import {
  AriaDialog,
  Button,
  CheckRegular,
  DialogTrigger,
  dropdownItemStyles,
  Popover,
  sectionHeaderClass,
} from "@lydie/plugin-api/ui";
import type { ButtonVariants } from "@lydie/plugin-api/ui";
import type { ReactNode, RefObject } from "react";

type Placement = "bottom start" | "bottom end" | "bottom" | "right top" | "top start";

export function PopoverButton({
  label,
  button,
  children,
  placement = "bottom start",
  isOpen,
  onOpenChange,
  variant = "ghost",
  size = "sm",
  className,
}: {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  placement?: Placement;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  className?: string;
}) {
  return (
    <DialogTrigger
      {...(isOpen !== undefined ? { isOpen } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <Button variant={variant} size={size} aria-label={label} className={className}>
        {button}
      </Button>
      <Popover placement={placement} className="max-h-[70vh] overflow-auto">
        <AriaDialog aria-label={label} className="outline-none">
          {({ close }) => children(close)}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

export function AnchoredPopover({
  anchor,
  label,
  onClose,
  children,
  placement = "bottom start",
  cover,
  strong = false,
}: {
  anchor: RefObject<Element | null>;
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: Placement;
  // The anchor's height: the popover then opens over the anchor (the shared EditorPopover: a
  // cell's editor takes the cell's place, a little larger) instead of next to it.
  // It appears at once and does not lock the page: the view behind still scrolls and takes
  // hover, and a click elsewhere (focus leaving) closes it.
  cover?: number;
  // The field reads like the cell it covers: the title column is set in medium weight.
  strong?: boolean;
}) {
  if (cover !== undefined) {
    return (
      <EditorPopover
        anchor={anchor}
        label={label}
        cover={cover}
        onClose={onClose}
        strong={strong}
        nonModal
      >
        {children}
      </EditorPopover>
    );
  }
  return (
    <Popover
      triggerRef={anchor}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement={placement}
      offset={2}
      className="max-h-[70vh] overflow-auto"
    >
      <AriaDialog aria-label={label} className="outline-none">
        {children}
      </AriaDialog>
    </Popover>
  );
}

export function MenuButtonItem({
  children,
  onPress,
  danger = false,
  selected,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  // A plain button drawn as the shared MenuItem (`dropdownItemStyles`, its check column and text
  // span): these panels mix fields with rows, so they are dialogs rather than react-aria Menus,
  // and a row stays a button. Hover and keyboard focus show the menu's highlight.
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onPress}
      className={dropdownItemStyles({
        isDisabled: disabled,
        className: "w-full gap-2 text-left hover:bg-gray-100 focus-visible:bg-gray-100",
      })}
    >
      {selected !== undefined && (
        <span className="flex w-4 items-center">
          {selected && <CheckRegular aria-hidden className="size-4" />}
        </span>
      )}
      <span
        className={`flex flex-1 items-center gap-2 truncate text-sm font-normal ${danger ? "text-red-600" : disabled ? "text-gray-300" : "text-gray-800"}`}
      >
        {children}
      </span>
    </button>
  );
}

// A group of MenuButtonItems with the shared dropdown section's header.
export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col p-1">
      {title && <p className={sectionHeaderClass}>{title}</p>}
      {children}
    </div>
  );
}
