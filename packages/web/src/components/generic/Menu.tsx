import { CheckmarkRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { createLink } from "@tanstack/react-router";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuProps as AriaMenuProps,
  MenuSection as AriaMenuSection,
  type MenuSectionProps as AriaMenuSectionProps,
  Collection,
  Header,
  type MenuItemProps,
  type SeparatorProps,
  composeRenderProps,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { dropdownItemStyles } from "./ListBox";
import { Popover, type PopoverProps } from "./Popover";
import { Separator } from "./Separator";

interface MenuProps<T> extends AriaMenuProps<T> {
  placement?: PopoverProps["placement"];
}

export function Menu<T extends object>(props: MenuProps<T>) {
  return (
    <Popover placement={props.placement} className="min-w-[150px]">
      <AriaMenu {...props} className="outline-none max-h-[inherit] overflow-auto p-1" />
    </Popover>
  );
}

export function MenuItem(props: MenuItemProps) {
  let textValue =
    props.textValue || (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaMenuItem textValue={textValue} {...props} className={dropdownItemStyles}>
      {composeRenderProps(props.children, (children, { selectionMode, isSelected, hasSubmenu }) => (
        <>
          {selectionMode !== "none" && (
            <span className="flex items-center w-4">
              {isSelected && <CheckmarkRegular aria-hidden className="w-4 h-4" />}
            </span>
          )}
          <span className="flex items-center flex-1 truncate group-selected:font-semibold text-sm font-normal text-gray-800">
            {children}
          </span>
          {hasSubmenu && <ChevronRightRegular aria-hidden className="absolute w-4 h-4 right-2" />}
        </>
      ))}
    </AriaMenuItem>
  );
}

export const MenuItemLink = createLink(MenuItem);

export function MenuSeparator({ className, ...props }: SeparatorProps) {
  return <Separator {...props} className={twMerge("my-1 -mx-1", className)} />;
}

export interface MenuSectionProps<T> extends AriaMenuSectionProps<T> {
  title?: string;
  items?: any;
}

export function MenuSection<T extends object>(props: MenuSectionProps<T>) {
  return (
    <AriaMenuSection className="first:-mt-[5px] after:content-[''] after:block after:h-[5px]">
      <Header className="text-sm font-semibold text-gray-500 dark:text-zinc-300 px-4 py-1 truncate sticky -top-[5px] -mt-px -mx-1 z-10 bg-gray-100/60 dark:bg-zinc-700/60 backdrop-blur-md supports-[-moz-appearance:none]:bg-gray-100 border-y border-y-gray-200 dark:border-y-zinc-700 [&+*]:mt-1">
        {props.title}
      </Header>
      <Collection items={props.items}>{props.children}</Collection>
    </AriaMenuSection>
  );
}
