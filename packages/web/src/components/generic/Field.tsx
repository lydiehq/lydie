import {
  type FieldErrorProps,
  Group,
  type GroupProps,
  type InputProps,
  type LabelProps,
  FieldError as RACFieldError,
  Input as RACInput,
  Label as RACLabel,
  Text,
  type TextProps,
  composeRenderProps,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { composeTailwindRenderProps, focusRing } from "./utils";
import { compose, cva } from "cva";
import { forwardRef } from "react";

export function Label(props: LabelProps) {
  return (
    <RACLabel
      {...props}
      className={twMerge(
        "text-sm text-gray-700 font-medium cursor-default w-fit",
        props.className
      )}
    />
  );
}

export function Description(props: TextProps) {
  return (
    <Text
      {...props}
      slot="description"
      className={twMerge("text-sm text-gray-600", props.className)}
    />
  );
}

export function FieldError(props: FieldErrorProps) {
  return (
    <RACFieldError
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "text-sm text-red-600 forced-colors:text-[Mark]"
      )}
    />
  );
}

export const fieldBorderStyles = cva({
  variants: {
    isFocusWithin: {
      false:
        "border-gray-300 dark:border-gray-500 forced-colors:border-[ButtonBorder]",
      true: "border-gray-600 dark:border-gray-300 forced-colors:border-[Highlight]",
    },
    isInvalid: {
      true: "border-red-600 dark:border-red-600 forced-colors:border-[Mark]",
    },
    isDisabled: {
      true: "border-gray-200 dark:border-gray-700 forced-colors:border-[GrayText]",
    },
  },
});

export const fieldGroupStyles = compose(
  cva({
    base: "group flex items-center h-9 bg-white dark:bg-gray-950 forced-colors:bg-[Field] border rounded-lg overflow-hidden",
  }),
  focusRing,
  fieldBorderStyles
);

export function FieldGroup(props: GroupProps) {
  return (
    <Group
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        fieldGroupStyles({ ...renderProps, className })
      )}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  return (
    <RACInput
      {...props}
      ref={ref}
      className={composeTailwindRenderProps(
        props.className,
        "px-3 py-2 flex-1 ring ring-black/8 rounded-md min-w-0 bg-white text-sm text-gray-800 disabled:text-gray-200 focus:ring-black/20"
      )}
    />
  );
});
