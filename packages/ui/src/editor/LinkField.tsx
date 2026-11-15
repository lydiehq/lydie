import { useState } from "react";
import { Input, TextField } from "react-aria-components";

import { Button } from "../components/Button";
import { CheckRegular, UnlinkRegular } from "../icons/mingcute";

type Props = {
  defaultValue?: string;
  onSubmit: (href: string) => void;
  onRemove?: () => void;
  onCancel: () => void;
};

// Inline URL field for the bubble toolbar. v1 had a 646-line LinkPopover with document search;
// internal links are wiki links in v2, so this only edits URLs.
export function LinkField({ defaultValue = "", onSubmit, onRemove, onCancel }: Props) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <TextField aria-label="Link URL" value={value} onChange={setValue} autoFocus>
        <Input
          placeholder="Paste or type a link"
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          className="h-7.5 w-56 rounded-md bg-white/10 px-2.5 text-sm text-white outline-none placeholder:text-white/50"
        />
      </TextField>
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Apply link">
        <CheckRegular className="size-[15px]" />
      </Button>
      {onRemove && (
        <Button variant="ghost" size="icon-sm" aria-label="Remove link" onPress={onRemove}>
          <UnlinkRegular className="size-[15px]" />
        </Button>
      )}
    </form>
  );
}
