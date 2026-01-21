import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  TextArea,
  type ValidationResult,
} from "react-aria-components"
import { useFieldContext } from "@/hooks/use-app-form"
import { Description, FieldError, Input, Label } from "./Field"
import { composeTailwindRenderProps, focusRing } from "./utils"

export interface TextFieldProps extends Omit<AriaTextFieldProps, "name"> {
  label?: string
  description?: string
  placeholder?: string
  errorMessage?: string | ((validation: ValidationResult) => string)
  textarea?: boolean
  labelClassName?: string
  descriptionClassName?: string
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  textarea,
  ...props
}: TextFieldProps) {
  const field = useFieldContext<string>()

  return (
    <AriaTextField
      {...props}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      onBlur={field.handleBlur}
      className={composeTailwindRenderProps(props.className, "flex flex-col gap-1")}
      validationBehavior="aria"
      isInvalid={field.state.meta.errors.length > 0}
    >
      {label && <Label>{label}</Label>}
      {textarea ? (
        <TextArea rows={4} placeholder={placeholder} className={focusRing} />
      ) : (
        <Input placeholder={placeholder} className={focusRing} />
      )}
      {description && <Description className={descriptionClassName}>{description}</Description>}
      <FieldError>
        {field.state.meta.errors.length > 0 ? field.state.meta.errors.join(", ") : errorMessage}
      </FieldError>
    </AriaTextField>
  )
}
