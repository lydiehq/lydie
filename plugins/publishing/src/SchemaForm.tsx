import {
  Checkbox,
  CheckboxGroup,
  Select,
  SelectItem,
  Switch,
  TextField,
} from "@lydie/plugin-api/ui";

import type { Field, FormValues } from "./schema-form.ts";

// Renders fields derived from a connector's JSON Schema.
export function SchemaForm({
  fields,
  values,
  errors,
  onChange,
  idPrefix,
}: {
  fields: readonly Field[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (values: FormValues) => void;
  idPrefix: string;
}) {
  const set = (key: string, value: string | boolean) => onChange({ ...values, [key]: value });
  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => {
        const error = errors[f.key];
        const description = f.description ?? undefined;
        if (f.kind === "boolean") {
          return (
            <Switch
              key={f.key}
              isSelected={values[f.key] === true}
              onChange={(on) => set(f.key, on)}
            >
              {f.label}
            </Switch>
          );
        }
        if (f.kind === "list" && f.options.length > 0) {
          const chosen = String(values[f.key] ?? "")
            .split(",")
            .filter(Boolean);
          return (
            <CheckboxGroup
              key={f.key}
              label={f.label}
              description={description}
              value={chosen}
              onChange={(next) => set(f.key, next.join(","))}
            >
              {f.options.map((o) => (
                <Checkbox key={o} value={o}>
                  {o}
                </Checkbox>
              ))}
            </CheckboxGroup>
          );
        }
        if (f.kind === "enum") {
          return (
            <Select
              key={f.key}
              label={f.label}
              description={description}
              isRequired={f.required}
              selectedKey={String(values[f.key] ?? "") || null}
              onSelectionChange={(key) => set(f.key, String(key))}
              errorMessage={error}
              isInvalid={Boolean(error)}
            >
              {f.options.map((o) => (
                <SelectItem key={o} id={o}>
                  {o}
                </SelectItem>
              ))}
            </Select>
          );
        }
        return (
          <TextField
            key={f.key}
            id={`${idPrefix}-${f.key}`}
            label={f.label}
            description={
              f.kind === "map"
                ? (description ?? "One “key: value” per line.")
                : f.kind === "list"
                  ? (description ?? "Separate several with commas.")
                  : description
            }
            textarea={f.kind === "map"}
            type={f.kind === "secret" ? "password" : f.kind === "url" ? "url" : "text"}
            inputMode={f.kind === "number" ? "decimal" : undefined}
            isRequired={f.required}
            value={String(values[f.key] ?? "")}
            onChange={(value) => set(f.key, value)}
            isInvalid={Boolean(error)}
            errorMessage={error}
            autoComplete={f.kind === "secret" ? "off" : undefined}
          />
        );
      })}
    </div>
  );
}
