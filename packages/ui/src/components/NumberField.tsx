import React from "react";
import type {
  ButtonProps,
  NumberFieldProps as AriaNumberFieldProps,
  ValidationResult,
} from "react-aria-components";
import { Button, NumberField as AriaNumberField } from "react-aria-components";

import { DownRegular, UpRegular } from "../icons/mingcute";
import {
  Description,
  fieldBorderStyles,
  FieldError,
  FieldGroup,
  groupedInputClass,
  Input,
  Label,
} from "./Field";
import { composeTailwindRenderProps } from "./utils";

export interface NumberFieldProps extends AriaNumberFieldProps {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function NumberField({ label, description, errorMessage, ...props }: NumberFieldProps) {
  return (
    <AriaNumberField
      {...props}
      className={composeTailwindRenderProps(props.className, "group flex flex-col gap-1")}
    >
      <Label>{label}</Label>
      <FieldGroup>
        {(renderProps) => (
          <>
            <Input className={groupedInputClass} />
            <div
              className={fieldBorderStyles({
                ...renderProps,
                class: "flex flex-col self-stretch border-s",
              })}
            >
              <StepperButton slot="increment">
                <UpRegular aria-hidden className="size-3.5" />
              </StepperButton>
              <div
                className={fieldBorderStyles({
                  ...renderProps,
                  class: "border-b",
                })}
              />
              <StepperButton slot="decrement">
                <DownRegular aria-hidden className="size-3.5" />
              </StepperButton>
            </div>
          </>
        )}
      </FieldGroup>
      {description && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaNumberField>
  );
}

function StepperButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      className="flex min-h-0 flex-1 items-center px-1 cursor-default text-gray-500 hover:bg-gray-950/5 pressed:bg-gray-950/8 group-disabled:text-gray-200 forced-colors:group-disabled:text-[GrayText]"
    />
  );
}
