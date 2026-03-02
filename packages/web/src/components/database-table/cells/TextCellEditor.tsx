import { useState } from "react";
import { Input } from "react-aria-components";

import { focusVisibleStyles } from "@/utils/focus-ring";

type Props = {
  autoFocus?: boolean;
  type: "text" | "number" | "datetime-local";
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

export function TextCellEditor({ autoFocus = true, type, initialValue, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="mx-1 my-0.5 rounded-md border border-blue-200 bg-white shadow-sm ring-1 ring-blue-100">
      <Input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className={`h-8 w-full rounded-md border-0 bg-transparent px-2.5 py-1 text-sm ${focusVisibleStyles}`}
      />
    </div>
  );
}
