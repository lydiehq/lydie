import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from "react-aria-components";

import { Description, FieldError, Input, Label, TextArea } from "./Field";
import { composeTailwindRenderProps, focusRing } from "./utils";

export interface TextFieldProps extends AriaTextFieldProps {
  label?: string;
  description?: string;
  placeholder?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  textarea?: boolean;
  labelClassName?: string;
  descriptionClassName?: string;
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  textarea,
  labelClassName,
  descriptionClassName,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      {...props}
      className={composeTailwindRenderProps(props.className, "flex flex-col gap-1")}
      validationBehavior="aria"
    >
      {label && <Label className={labelClassName}>{label}</Label>}
      {textarea ? (
        <TextArea rows={4} placeholder={placeholder} className={focusRing} />
      ) : (
        <Input placeholder={placeholder} className={focusRing} />
      )}
      {description && <Description className={descriptionClassName}>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
