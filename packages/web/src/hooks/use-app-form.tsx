import type { ComponentProps } from "react";
import type { ValidationResult } from "react-aria-components";

import { TextField as UITextField } from "@lydie/ui/components/generic/TextField";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";

export const { fieldContext, useFieldContext, formContext } = createFormHookContexts();

function AppFormTextField(
  props: Omit<ComponentProps<typeof UITextField>, "value" | "onChange" | "onBlur" | "isInvalid">,
) {
  const field = useFieldContext<string>();

  return (
    <UITextField
      {...props}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      onBlur={field.handleBlur}
      isInvalid={field.state.meta.errors.length > 0}
      errorMessage={
        field.state.meta.errors.length > 0
          ? field.state.meta.errors.join(", ")
          : (props.errorMessage as string | ((validation: ValidationResult) => string) | undefined)
      }
    />
  );
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField: AppFormTextField,
  },
  formComponents: {},
});
