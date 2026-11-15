import {
  Autocomplete,
  Button,
  Label,
  ListBox,
  Popover,
  SearchField,
  Select,
  SelectValue,
  useFilter,
} from "react-aria-components";

import { Input } from "../components/Field";
import { DropdownItem } from "../components/ListBox";
import { focusRingClass } from "../components/utils";
import { DownRegular } from "../icons/mingcute";

type Props = {
  language: string | null;
  languages: string[];
  onChange: (language: string | null) => void;
  isDisabled?: boolean;
};

const AUTO = "__auto";

// v1's code block LanguageSelect: a searchable select in the block's corner.
export function CodeLanguagePicker({ language, languages, onChange, isDisabled }: Props) {
  const { contains } = useFilter({ sensitivity: "base" });
  const items = [{ id: AUTO, name: "auto" }, ...languages.map((name) => ({ id: name, name }))];

  return (
    <Select
      value={language ?? AUTO}
      onChange={(key) => onChange(key === null || key === AUTO ? null : String(key))}
      isDisabled={isDisabled}
    >
      <Label className="sr-only">Code language</Label>
      <Button className={`flex items-center gap-x-1.5 rounded-md ${focusRingClass}`}>
        <SelectValue className="text-sm font-medium text-gray-700" />
        <DownRegular className="size-4 text-gray-500" />
      </Button>
      <Popover className="flex max-h-72 w-48 flex-col rounded-lg bg-elevated shadow-popover">
        <Autocomplete filter={contains}>
          <SearchField aria-label="Search languages" className="m-1" autoFocus>
            <Input placeholder="Search" size="sm" className="w-full" />
          </SearchField>
          <ListBox items={items} className="min-h-0 flex-1 overflow-auto p-1 outline-none">
            {(item) => <DropdownItem id={item.id}>{item.name}</DropdownItem>}
          </ListBox>
        </Autocomplete>
      </Popover>
    </Select>
  );
}
