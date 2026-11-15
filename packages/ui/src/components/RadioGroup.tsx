import type { ReactNode } from "react";
import {
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioGroupProps as RACRadioGroupProps,
  type RadioProps,
  type ValidationResult,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { Description, FieldError, Label } from "./Field";
import { composeTailwindRenderProps, focusRingFor } from "./utils";

export interface RadioGroupProps extends Omit<RACRadioGroupProps, "children"> {
  label?: string;
  children?: ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function RadioGroup(props: RadioGroupProps) {
  return (
    <RACRadioGroup
      {...props}
      className={composeTailwindRenderProps(props.className, "group flex flex-col gap-2")}
    >
      <Label>{props.label}</Label>
      <div className="flex group-orientation-vertical:flex-col gap-2 group-orientation-horizontal:gap-4">
        {props.children}
      </div>
      {props.description && <Description>{props.description}</Description>}
      <FieldError>{props.errorMessage}</FieldError>
    </RACRadioGroup>
  );
}

// After shadcn's radio: a small circle with a hairline edge, filled when selected. The fill is the
// primary button's (`button-primary`), and the dot takes its label colour through `bg-current`.
const styles = tv({
  extend: focusRingFor,
  base: "relative flex size-4 shrink-0 items-center justify-center rounded-full border transition-[border-color,box-shadow] duration-150",
  variants: {
    isSelected: {
      false:
        "border-gray-950/20 bg-surface shadow-xs group-hover:border-gray-950/30 group-pressed:border-gray-950/40",
      true: "button-primary border-transparent group-hover:[--button-primary-overlay:rgb(40_80_170/0.2)] group-pressed:[--button-primary-overlay:rgb(32_66_150/0.36)] forced-colors:bg-[Highlight]!",
    },
    isInvalid: {
      true: "border-red-500 ring-3 ring-red-500/20 forced-colors:border-[Mark]!",
    },
    isDisabled: {
      true: "opacity-50 forced-colors:border-[GrayText]!",
    },
  },
});

const dotStyles = tv({
  base: "size-1.5 rounded-full bg-current transition-transform duration-150 ease-out",
  variants: {
    isSelected: {
      false: "scale-0",
      true: "scale-100",
    },
  },
});

export function Radio(props: RadioProps) {
  return (
    <RACRadio
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "flex gap-2 items-center group text-gray-800 disabled:text-gray-300 forced-colors:disabled:text-[GrayText] text-sm transition",
      )}
    >
      {(renderProps) => (
        <>
          <div className={styles(renderProps)}>
            <span className={dotStyles(renderProps)} />
          </div>
          {props.children}
        </>
      )}
    </RACRadio>
  );
}
