import React from "react";
import {
  Button,
  ListBox,
  type ListBoxItemProps,
  Select as AriaSelect,
  type SelectProps as AriaSelectProps,
  SelectValue,
  type ValidationResult,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { DownRegular } from "../icons/mingcute";
import { buttonStyles } from "./Button";
import { Description, FieldError, fieldSurfaceClass, Label } from "./Field";
import { DropdownItem, DropdownSection, type DropdownSectionProps } from "./ListBox";
import { Popover } from "./Popover";
import { compose, composeTailwindRenderProps, focusRing } from "./utils";

// The field look of Input and TextField (Field.tsx): same edge, radius, fill and height. It is a
// button, so it keeps the focus ring for the keyboard.
const styles = tv({
  base: `flex items-center text-start gap-4 w-full cursor-default min-w-[150px] ${fieldSurfaceClass}`,
  variants: {
    size: {
      sm: "h-7 pl-2.5 pr-1.5 rounded-md",
      md: "h-7.5 pl-2.5 pr-2 rounded-lg",
    },
    isDisabled: {
      false:
        "text-gray-800 hover:border-gray-950/12 pressed:bg-gray-950/3 group-data-open:border-gray-950/12 group-data-invalid:ring-3 group-data-invalid:ring-red-500/20",
      true: "text-gray-800 opacity-50 forced-colors:text-[GrayText]",
    },
  },
});

const fieldStyles = compose(styles, focusRing);

export interface SelectProps<T extends object> extends Omit<AriaSelectProps<T>, "children"> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  // `field` is the form control; `ghost` is a ghost Button with a chevron, for toolbars, where a
  // field would stand out among the buttons beside it.
  variant?: "field" | "ghost";
  // The height of the Button of the same size: a field takes sm or md, a ghost select xs or sm.
  size?: "xs" | "sm" | "md";
}

export function Select<T extends object>({
  label,
  description,
  errorMessage,
  children,
  items,
  variant = "field",
  size,
  ...props
}: SelectProps<T>) {
  return (
    <AriaSelect
      {...props}
      className={composeTailwindRenderProps(props.className, "group flex flex-col gap-1")}
    >
      {label && <Label>{label}</Label>}
      {variant === "ghost" ? (
        <Button className={buttonStyles({ variant: "ghost", size: size === "xs" ? "xs" : "sm" })}>
          <SelectValue />
          <DownRegular aria-hidden data-icon="inline-end" className="text-gray-500" />
        </Button>
      ) : (
        <Button
          className={(renderProps) =>
            fieldStyles({ ...renderProps, size: size === "sm" ? "sm" : "md" })
          }
        >
          <SelectValue className="flex-1 text-sm placeholder-shown:text-gray-500" />
          <DownRegular
            aria-hidden
            className="w-4 h-4 text-gray-600 forced-colors:text-[ButtonText] group-disabled:text-gray-200 forced-colors:group-disabled:text-[GrayText]"
          />
        </Button>
      )}
      {description && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
      <Popover className="min-w-(--trigger-width)">
        <ListBox
          items={items}
          className="outline-hidden p-1 max-h-[inherit] scroll-fade-b overflow-auto [clip-path:inset(0_0_0_0_round_.75rem)]"
        >
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

export function SelectItem(props: ListBoxItemProps) {
  return <DropdownItem {...props} />;
}

export function SelectSection<T extends object>(props: DropdownSectionProps<T>) {
  return <DropdownSection {...props} />;
}
