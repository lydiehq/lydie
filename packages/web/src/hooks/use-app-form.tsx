import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { TextField } from "@/components/generic/TextField"

export const { fieldContext, useFieldContext, formContext } = createFormHookContexts()

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
  },
  formComponents: {},
})
