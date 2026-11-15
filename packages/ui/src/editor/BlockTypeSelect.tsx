import { ListBox, Select } from "react-aria-components";

import { Button } from "../components/Button";
import { DropdownItem } from "../components/ListBox";
import { Popover } from "../components/Popover";
import { DownRegular } from "../icons/mingcute";
import type { BlockTypeOption } from "./types";

type Props = {
  options: BlockTypeOption[];
  value: string;
  onChange: (id: string) => void;
  isDisabled?: boolean;
};

// v1's BlockTypeDropdown.
export function BlockTypeSelect({ options, value, onChange, isDisabled }: Props) {
  const active = options.find((option) => option.id === value) ?? options[0];
  return (
    <Select
      value={active?.id ?? null}
      onChange={(key) => key !== null && onChange(String(key))}
      aria-label="Block type"
      isDisabled={isDisabled}
    >
      <Button variant="ghost" size="sm">
        {active?.label ?? "Paragraph"}
        <DownRegular aria-hidden className="ml-2 size-3.5 shrink-0" />
      </Button>
      <Popover className="min-w-(--trigger-width)">
        <ListBox className="max-h-[inherit] scroll-fade-b overflow-auto p-1 outline-hidden [clip-path:inset(0_0_0_0_round_.75rem)]">
          {options.map((option) => (
            <DropdownItem key={option.id} id={option.id}>
              {option.label}
            </DropdownItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
