import type { ReactNode } from "react";
import {
  Collection,
  composeRenderProps,
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  MenuSection as AriaMenuSection,
  type MenuSectionProps as AriaMenuSectionProps,
  type SeparatorProps,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { CheckRegular, RightRegular } from "../icons/mingcute";
import { Separator } from "../layout/Separator";
import { dropdownItemStyles, sectionHeaderClass } from "./ListBox";
import { Popover, type PopoverProps } from "./Popover";
import { switchHandle, switchTrack } from "./Switch";

interface MenuProps<T> extends AriaMenuProps<T> {
  placement?: PopoverProps["placement"];
  // Of the popover, e.g. a wider minimum width.
  popoverClassName?: string;
}

export function Menu<T extends object>({ placement, popoverClassName, ...props }: MenuProps<T>) {
  return (
    <Popover placement={placement} className={twMerge("min-w-[150px]", popoverClassName)}>
      <AriaMenu
        {...props}
        className="outline-none max-h-[inherit] scroll-fade-b overflow-auto p-1"
      />
    </Popover>
  );
}

export interface MenuItemProps extends AriaMenuItemProps {
  // Before the label, muted (red with `danger`).
  icon?: ReactNode;
  danger?: boolean;
  // How a checkable item shows its state: a check before the label, or a switch at the end
  // (an on/off setting, as in Notion's page menu).
  indicator?: "check" | "switch";
}

export function MenuItem({ icon, danger, indicator = "check", ...props }: MenuItemProps) {
  let textValue =
    props.textValue || (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaMenuItem
      textValue={textValue}
      {...props}
      className={(state) =>
        dropdownItemStyles({ ...state, className: icon ? "gap-2 pr-2" : undefined })
      }
    >
      {composeRenderProps(props.children, (children, { selectionMode, isSelected, hasSubmenu }) => (
        <>
          {selectionMode !== "none" && indicator === "check" && (
            <span className="flex items-center w-4">
              {isSelected && <CheckRegular aria-hidden className="w-4 h-4" />}
            </span>
          )}
          {icon && (
            <span
              aria-hidden
              className={twMerge(
                "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
                danger ? "text-red-600" : "text-gray-500",
              )}
            >
              {icon}
            </span>
          )}
          <span
            className={twMerge(
              "flex items-center flex-1 truncate text-sm font-normal text-gray-800",
              indicator === "check" && "group-selected:font-semibold",
              danger && "text-red-600",
            )}
          >
            {children}
          </span>
          {selectionMode !== "none" && indicator === "switch" && (
            <span aria-hidden className={switchTrack({ isSelected, className: "ml-2" })}>
              <span className={switchHandle({ isSelected })} />
            </span>
          )}
          {hasSubmenu && <RightRegular aria-hidden className="absolute w-4 h-4 right-2" />}
        </>
      ))}
    </AriaMenuItem>
  );
}

export function MenuSeparator({ className, ...props }: SeparatorProps) {
  return <Separator {...props} className={twMerge("my-1 -mx-1", className)} />;
}

export interface MenuSectionProps<T> extends AriaMenuSectionProps<T> {
  title?: string;
  items?: any;
}

// Without a title: a plain group, e.g. to give part of a menu its own selection mode.
export function MenuSection<T extends object>({
  title,
  items,
  children,
  className,
  ...props
}: MenuSectionProps<T>) {
  return (
    <AriaMenuSection
      {...props}
      className={twMerge(
        title ? "first:-mt-[5px] after:content-[''] after:block after:h-[5px]" : "",
        typeof className === "string" ? className : undefined,
      )}
    >
      {title && <Header className={sectionHeaderClass}>{title}</Header>}
      <Collection items={items}>{children}</Collection>
    </AriaMenuSection>
  );
}
