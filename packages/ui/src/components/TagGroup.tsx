import React, { createContext, useContext } from "react";
import type {
  TagGroupProps as AriaTagGroupProps,
  TagListProps,
  TagProps as AriaTagProps,
} from "react-aria-components";
import {
  Button,
  composeRenderProps,
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  TagList,
  Text,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { CloseRegular } from "../icons/mingcute";
import { Description, Label } from "./Field";
import { focusRing } from "./utils";

const colors = {
  gray: "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300",
  green: "bg-green-100 text-green-700 border-green-200 hover:border-green-300",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200 hover:border-yellow-300",
  blue: "bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-300",
};

type Color = keyof typeof colors;
const ColorContext = createContext<Color>("gray");

const tagStyles = tv({
  extend: focusRing,
  base: "cursor-default text-xs rounded-full border px-3 py-0.5 flex items-center max-w-fit gap-1",
  variants: {
    color: {
      gray: "",
      green: "",
      yellow: "",
      blue: "",
    },
    allowsRemoving: {
      true: "pr-1",
    },
    isSelected: {
      true: "bg-blue-600 text-white border-transparent forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-color-adjust-none",
    },
    isDisabled: {
      true: "bg-gray-100 text-gray-300 forced-colors:text-[GrayText]",
    },
  },
  compoundVariants: (Object.keys(colors) as Color[]).map((color) => ({
    isSelected: false,
    isDisabled: false,
    color,
    class: colors[color],
  })),
});

export interface TagGroupProps<T>
  extends
    Omit<AriaTagGroupProps, "children">,
    Pick<TagListProps<T>, "items" | "children" | "renderEmptyState"> {
  color?: Color;
  label?: string;
  description?: string;
  errorMessage?: string;
}

export interface TagProps extends AriaTagProps {
  color?: Color;
}

export function TagGroup<T extends object>({
  label,
  description,
  errorMessage,
  items,
  children,
  renderEmptyState,
  ...props
}: TagGroupProps<T>) {
  return (
    <AriaTagGroup {...props} className={twMerge("flex flex-col gap-1", props.className)}>
      <Label>{label}</Label>
      <ColorContext.Provider value={props.color || "gray"}>
        <TagList items={items} renderEmptyState={renderEmptyState} className="flex flex-wrap gap-1">
          {children}
        </TagList>
      </ColorContext.Provider>
      {description && <Description>{description}</Description>}
      {errorMessage && (
        <Text slot="errorMessage" className="text-sm text-red-600">
          {errorMessage}
        </Text>
      )}
    </AriaTagGroup>
  );
}

const removeButtonStyles = tv({
  extend: focusRing,
  base: "cursor-default rounded-full p-0.5 flex items-center justify-center hover:bg-gray-950/10 pressed:bg-gray-950/20",
});

export function Tag({ children, color, ...props }: TagProps) {
  let textValue = typeof children === "string" ? children : undefined;
  let groupColor = useContext(ColorContext);
  return (
    <AriaTag
      textValue={textValue}
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tagStyles({ ...renderProps, className, color: color || groupColor }),
      )}
    >
      {({ allowsRemoving }) => (
        <>
          {children}
          {allowsRemoving && (
            // react-aria's remove slot, not the design system's Button.
            // oxlint-disable-next-line lydie/icon-button-tooltip
            <Button slot="remove" className={removeButtonStyles()}>
              <CloseRegular aria-hidden className="w-3 h-3" />
            </Button>
          )}
        </>
      )}
    </AriaTag>
  );
}
