import { type ReactNode } from "react"
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
  variants: {
    isSelected: {
      false:
        "bg-white dark:bg-zinc-900 border-(--color) [--color:var(--color-gray-400)] dark:[--color:colors.zinc-400)] group-pressed:[--color:var(--color-gray-500)] dark:group-pressed:[--color:var(--color-zinc-300)]",
      true: "bg-(--color) border-(--color) [--color:var(--color-gray-700)] group-pressed:[--color:var(--color-gray-800)] dark:[--color:var(--color-slate-300)] dark:group-pressed:[--color:var(--color-slate-200)] forced-colors:[--color:Highlight]!",
    },
  },
})

const checkmarkStyles = "checkbox-checkmark"

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
            {isIndeterminate ? (
              <MinusIcon aria-hidden className={iconStyles} />
            ) : isSelected ? (
              <CheckIcon aria-hidden className={iconStyles} />
            ) : null}
          </div>
          {props.children}
        </>
      )}
    </AriaCheckbox>
  )
}
