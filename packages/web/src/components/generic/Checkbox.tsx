import { type ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps,
  type ValidationResult,
  composeRenderProps,
} from "react-aria-components"
import { cva } from "cva"
import { Description, FieldError, Label } from "./Field"
import { composeTailwindRenderProps } from "./utils"

export interface CheckboxGroupProps extends Omit<AriaCheckboxGroupProps, "children"> {
  label?: string
  children?: ReactNode
  description?: string
  errorMessage?: string | ((validation: ValidationResult) => string)
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
  )
}

const checkboxStyles = cva({
  base: "flex gap-2 items-center group text-sm transition",
  variants: {
    isDisabled: {
      false: "text-gray-800 dark:text-zinc-200",
      true: "text-gray-300 dark:text-zinc-600 forced-colors:text-[GrayText]",
    },
  },
})

const boxStyles = cva({
  base: "w-[18px] h-[18px] box-border rounded-sm transition-all duration-200 flex items-center justify-center flex-shrink-0 border",
  variants: {
    isSelected: {
      false:
        "bg-white dark:bg-zinc-900 border-gray-400 dark:border-zinc-400 group-pressed:border-gray-500 dark:group-pressed:border-zinc-300",
      true: "bg-gray-700 dark:bg-slate-300 border-gray-700 dark:border-slate-300 group-pressed:bg-gray-800 dark:group-pressed:bg-slate-200 forced-colors:bg-[Highlight] forced-colors:border-[Highlight]",
    },
  },
})

const checkmarkStyles = "checkbox-checkmark";

export function Checkbox(props: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        checkboxStyles({ ...renderProps, className }),
      )}
    >
      {({ isSelected, isIndeterminate, ...renderProps }) => (
        <>
          <div
            className={boxStyles({
              isSelected: isSelected || isIndeterminate,
              ...renderProps,
            })}
          >
            <svg
              viewBox="0 0 18 18"
              aria-hidden="true"
              key={isIndeterminate ? "indeterminate" : "check"}
              className={`${checkmarkStyles}${
                isSelected || isIndeterminate ? " checkbox-checkmark-selected" : ""
              }${isIndeterminate ? " checkbox-checkmark-indeterminate" : ""}${
                renderProps.isDisabled ? " checkbox-checkmark-disabled" : ""
              }`}
            >
              {isIndeterminate ? (
                <rect x={1} y={7.5} width={16} height={3} />
              ) : (
                <polyline points="2 9 7 14 16 4" />
              )}
            </svg>
          </div>
          {props.children}
        </>
      )}
    </AriaCheckbox>
  )
}
