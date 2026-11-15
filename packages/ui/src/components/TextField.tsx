import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from "react-aria-components";

import { Description, FieldError, type FieldSize, Input, Label, TextArea } from "./Field";
import { composeTailwindRenderProps } from "./utils";

export interface TextFieldProps extends AriaTextFieldProps {
  label?: string;
  description?: string;
  placeholder?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  textarea?: boolean;
  labelClassName?: string;
  descriptionClassName?: string;
  size?: FieldSize;
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  textarea,
  labelClassName,
  descriptionClassName,
  size,
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
        <TextArea rows={4} size={size} placeholder={placeholder} />
      ) : (
        <Input size={size} placeholder={placeholder} />
      )}
      {description && <Description className={descriptionClassName}>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
