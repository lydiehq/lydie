import { forwardRef } from "react";
import {
  composeRenderProps,
  FieldError as RACFieldError,
  type FieldErrorProps,
  Group,
  type GroupProps,
  Input as RACInput,
  type InputProps,
  Label as RACLabel,
  type LabelProps,
  Text,
  TextArea as RACTextArea,
  type TextAreaProps,
  type TextProps,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { composeTailwindRenderProps } from "./utils";

export function Label(props: LabelProps) {
  return (
    <RACLabel
      {...props}
      className={twMerge("text-sm text-gray-700 font-medium cursor-default w-fit", props.className)}
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
        "text-sm text-red-600 forced-colors:text-[Mark]",
      )}
    />
  );
}

// Every field has Numina's edge (`../app`'s Input): `surface-depth`'s hairline border and soft drop,
// written as plain utilities so the shadow adds up with the invalid halo's ring and tailwind-merge
// can take it off again (`groupedInputClass`). Focus strengthens the border; there is no focus
// ring, since a text field shows its focus with the caret.
export const fieldSurfaceClass =
  "border border-(--depth-border) bg-surface bg-clip-padding shadow-(--shadow-depth) transition-colors forced-colors:border-[ButtonBorder] forced-colors:bg-[Field]";

// `fieldBorderStyles` gives dividers inside a field (NumberField's steppers) the same colours.
export const fieldBorderStyles = tv({
  variants: {
    isFocusWithin: {
      false: "border-(--depth-border) forced-colors:border-[ButtonBorder]",
      true: "border-gray-950/12 forced-colors:border-[Highlight]",
    },
  },
});

export const fieldGroupStyles = tv({
  base: `group flex items-center rounded-lg overflow-hidden ${fieldSurfaceClass}`,
  variants: {
    isFocusWithin: { true: "border-gray-950/12 forced-colors:border-[Highlight]" },
    isInvalid: { true: "ring-3 ring-red-500/20 forced-colors:border-[Mark]" },
    isDisabled: { true: "opacity-50" },
  },
});

// An Input inside a FieldGroup: the group draws the edge. `-my-px` gives back the group's border,
// so the group keeps the Input's height.
export const groupedInputClass =
  "-my-px border-0 shadow-none rounded-none bg-transparent aria-invalid:ring-0 disabled:opacity-100";

export function FieldGroup(props: GroupProps) {
  return (
    <Group
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        fieldGroupStyles({ ...renderProps, className }),
      )}
    />
  );
}

// Field heights follow the Button scale, so a field and a button of the same size line up in a
// row: `md` (32px, the default) beside md buttons, `sm` (30px) beside sm ones.
export type FieldSize = "sm" | "md";

// The radius follows the Button of the same size too.
export const inputSizeClass: Record<FieldSize, string> = {
  sm: "h-7.5 px-2.5 rounded-md",
  md: "h-8 px-2.5 rounded-lg",
};

// Invalid adds Numina's soft red halo around the edge.
const fieldLookClass = `${fieldSurfaceClass} text-sm text-gray-800 placeholder:text-gray-500 outline-hidden focus:border-gray-950/12 forced-colors:focus:border-[Highlight] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-red-500/20`;

// `size` is the field size, not the HTML attribute (a width in characters, unused here).
export type FieldInputProps = Omit<InputProps, "size"> & { size?: FieldSize };
export type FieldTextAreaProps = Omit<TextAreaProps, "size"> & { size?: FieldSize };

export const Input = forwardRef<HTMLInputElement, FieldInputProps>(
  ({ size = "md", ...props }, ref) => {
    return (
      <RACInput
        {...props}
        ref={ref}
        className={composeTailwindRenderProps(
          props.className,
          // flex-auto, not flex-1: a zero basis would override the height in a column (TextField).
          `${inputSizeClass[size]} flex-auto min-w-0 ${fieldLookClass}`,
        )}
      />
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, FieldTextAreaProps>(
  ({ size = "md", ...props }, ref) => {
    return (
      <RACTextArea
        {...props}
        ref={ref}
        className={composeTailwindRenderProps(
          props.className,
          `${size === "sm" ? "px-2.5 py-1.25 rounded-md" : "px-2.5 py-1.5 rounded-lg"} w-full resize-y ${fieldLookClass}`,
        )}
      />
    );
  },
);
