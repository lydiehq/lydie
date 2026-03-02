import type { PropertyOption } from "@lydie/core/collection";
import { dropdownItemStyles } from "@lydie/ui/components/generic/ListBox";
import { Popover } from "@lydie/ui/components/generic/Popover";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComboBox, Input, ListBox, ListBoxItem, type Key } from "react-aria-components";

type Props = {
  "aria-label": string;
  options: PropertyOption[];
  selectedValues: string[];
  onCommit: (value: string[] | null) => void;
  onCancel: () => void;
  renderOption: (option: PropertyOption) => ReactNode;
};

export function MultiSelectCellEditor({
  "aria-label": ariaLabel,
  options,
  selectedValues,
  onCommit,
  onCancel,
  renderOption,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canceledRef = useRef(false);
  const [query, setQuery] = useState("");
  const [draftValues, setDraftValues] = useState<string[]>(selectedValues);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const placeholder = draftValues.length > 0 ? `${draftValues.length} selected` : "Select options";

  useEffect(() => {
    setDraftValues(selectedValues);
  }, [selectedValues]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mx-1 my-0.5">
      <ComboBox
        aria-label={ariaLabel}
        inputValue={query}
        menuTrigger="focus"
        allowsEmptyCollection
        onInputChange={setQuery}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            canceledRef.current = false;
            return;
          }

          if (canceledRef.current) {
            return;
          }

          onCommit(draftValues.length > 0 ? draftValues : null);
        }}
        className="w-full"
      >
        <div className="rounded-md border border-blue-200 bg-white shadow-sm ring-1 ring-blue-100">
          <Input
            ref={inputRef}
            autoFocus
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                canceledRef.current = true;
                onCancel();
              }
            }}
            className="h-8 w-full rounded-md border-0 bg-transparent px-2.5 py-1 text-sm outline-none"
          />
        </div>

        <Popover className="w-(--trigger-width) p-1">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDraftValues([]);
              onCommit(null);
            }}
            className="w-full cursor-default select-none rounded-md px-2 py-1 text-left text-sm text-gray-500 hover:bg-gray-100"
          >
            Clear selections
          </button>
          <ListBox
            selectionMode="multiple"
            selectedKeys={new Set(draftValues)}
            onSelectionChange={(keys) => {
              if (keys === "all") {
                setDraftValues(filteredOptions.map((option) => option.id));
                return;
              }

              setDraftValues(Array.from(keys).map((key) => String(key)));
            }}
            className="max-h-56 overflow-auto outline-none"
          >
            {filteredOptions.map((option) => (
              <ListBoxItem
                key={option.id}
                id={option.id as Key}
                textValue={option.label || option.id}
                className={({ isDisabled, isFocused, isSelected }) =>
                  `${dropdownItemStyles({ isDisabled, isFocused })} ${isSelected ? "bg-blue-50" : ""}`
                }
              >
                {renderOption(option)}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </ComboBox>
    </div>
  );
}
