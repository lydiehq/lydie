import { type ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps,
  composeRenderProps,
  type ValidationResult,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { Description, FieldError, Label } from "./Field";
import { composeTailwindRenderProps, focusRingFor } from "./utils";

export interface CheckboxGroupProps extends Omit<AriaCheckboxGroupProps, "children"> {
  label?: string;
  children?: ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function CheckboxGroup(props: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup
      {...props}
      className={composeTailwindRenderProps(props.className, "flex flex-col gap-2")}
    >
      <Label>{props.label}</Label>
      {props.children}
      {props.description && <Description>{props.description}</Description>}
      <FieldError>{props.errorMessage}</FieldError>
    </AriaCheckboxGroup>
  );
}

const checkboxStyles = tv({
  base: "flex gap-2 items-center group text-sm transition",
  variants: {
    isDisabled: {
      false: "text-gray-800",
      true: "text-gray-300 forced-colors:text-[GrayText]",
    },
  },
});

const boxStyles = tv({
  extend: focusRingFor,
  base: "size-3.5 box-border rounded-sm transition-all duration-200 flex items-center justify-center flex-shrink-0 shadow-surface",
  variants: {
    isSelected: {
      false: "bg-surface",
      true: "bg-gray-700",
    },
  },
});

const checkmarkStyles = "checkbox-checkmark";

type CheckboxMarkProps = {
  isSelected?: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  isFocusVisible?: boolean;
  className?: string;
};

// The box and its checkmark alone, without behaviour: what Checkbox draws, for places where
// something else owns the interaction (a table cell that flips on click, a read-only value).
export function CheckboxMark({
  isSelected = false,
  isIndeterminate = false,
  isDisabled = false,
  isFocusVisible = false,
  className,
}: CheckboxMarkProps) {
  return (
    <div
      className={boxStyles({
        isSelected: isSelected || isIndeterminate,
        isFocusVisible,
        className,
      })}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        key={isIndeterminate ? "indeterminate" : "check"}
        className={`${checkmarkStyles}${
          isSelected || isIndeterminate ? " checkbox-checkmark-selected" : ""
        }${isIndeterminate ? " checkbox-checkmark-indeterminate" : ""}${
          isDisabled ? " checkbox-checkmark-disabled" : ""
        }`}
      >
        {isIndeterminate ? (
          <rect x={1} y={7.5} width={16} height={3} />
        ) : (
          <polyline points="2 9 7 14 16 4" />
        )}
      </svg>
    </div>
  );
}

export function Checkbox(props: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        checkboxStyles({ ...renderProps, className }),
      )}
    >
      {({ isSelected, isIndeterminate, isDisabled, isFocusVisible }) => (
        <>
          <CheckboxMark
            isSelected={isSelected}
            isIndeterminate={isIndeterminate}
            isDisabled={isDisabled}
            isFocusVisible={isFocusVisible}
          />
          {props.children}
        </>
      )}
    </AriaCheckbox>
  );
}
