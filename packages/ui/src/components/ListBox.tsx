import {
  Collection,
  composeRenderProps,
  Header,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  type ListBoxItemProps,
  type ListBoxProps as AriaListBoxProps,
  ListBoxSection,
  type SectionProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { CheckRegular } from "../icons/mingcute";
import { compose, composeTailwindRenderProps, focusRing } from "./utils";

interface ListBoxProps<T> extends Omit<AriaListBoxProps<T>, "layout" | "orientation"> {}

export function ListBox<T extends object>({ children, ...props }: ListBoxProps<T>) {
  return (
    <AriaListBox
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "outline-none max-h-[inherit] overflow-auto p-1 bg-surface",
      )}
    >
      {children}
    </AriaListBox>
  );
}

export const itemStyles = tv({
  base: "group relative flex items-center gap-8 cursor-default select-none py-1.5 px-2.5 rounded-md will-change-transform text-sm forced-color-adjust-none",
  variants: {
    isSelected: {
      false: "text-gray-700 hover:bg-gray-200 -outline-offset-2",
      true: "bg-blue-600 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] [&:has(+[data-selected])]:rounded-b-none [&+[data-selected]]:rounded-t-none -outline-offset-4 outline-white forced-colors:outline-[HighlightText]",
    },
    isDisabled: {
      true: "text-gray-300 forced-colors:text-[GrayText]",
    },
  },
});

export function ListBoxItem(props: ListBoxItemProps) {
  let textValue =
    props.textValue || (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaListBoxItem
      {...props}
      textValue={textValue}
      className={compose(dropdownItemStyles, focusRing)}
    >
      {composeRenderProps(props.children, (children, { selectionMode, isSelected }) => (
        <>
          {selectionMode !== "none" && (
            <span className="flex items-center w-4">
              {isSelected && <CheckRegular aria-hidden className="w-4 h-4" />}
            </span>
          )}
          <span className="flex items-center flex-1 truncate group-selected:font-semibold text-sm font-normal text-gray-800">
            {children}
          </span>
        </>
      ))}
    </AriaListBoxItem>
  );
}

export const dropdownItemStyles = tv({
  base: "group flex items-center gap-4 cursor-default select-none py-1 pl-2 pr-1 rounded-md outline-none text-sm forced-color-adjust-none",
  variants: {
    isDisabled: {
      false: "text-gray-900",
      true: "text-gray-300 forced-colors:text-[GrayText]",
    },
    isFocused: {
      true: "bg-gray-100",
    },
  },
});

export function DropdownItem(props: ListBoxItemProps) {
  let textValue =
    props.textValue || (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaListBoxItem {...props} textValue={textValue} className={dropdownItemStyles}>
      {composeRenderProps(props.children, (children, { selectionMode, isSelected }) => (
        <>
          {selectionMode !== "none" && (
            <span className="flex items-center w-4">
              {isSelected && <CheckRegular aria-hidden className="w-4 h-4" />}
            </span>
          )}
          <span className="flex items-center flex-1 truncate group-selected:font-semibold text-sm font-normal text-gray-800">
            {children}
          </span>
        </>
      ))}
    </AriaListBoxItem>
  );
}

// The title of a section in a menu or dropdown: sticky while its items scroll under it.
export const sectionHeaderClass =
  "text-xs font-medium text-gray-500 py-1 truncate sticky -top-[5px] -mt-px -mx-1 z-10 bg-elevated px-3 [&+*]:mt-1";

export interface DropdownSectionProps<T> extends SectionProps<T> {
  title?: string;
  items?: any;
}

export function DropdownSection<T extends object>(props: DropdownSectionProps<T>) {
  return (
    <ListBoxSection className="first:-mt-[5px] after:content-[''] after:block after:h-[5px]">
      <Header className={sectionHeaderClass}>{props.title}</Header>
      <Collection items={props.items}>{props.children}</Collection>
    </ListBoxSection>
  );
}
