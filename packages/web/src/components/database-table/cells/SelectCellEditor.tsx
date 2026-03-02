import type { PropertyOption } from "@lydie/core/collection";
import { dropdownItemStyles } from "@lydie/ui/components/generic/ListBox";
import { Popover } from "@lydie/ui/components/generic/Popover";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComboBox, Input, ListBox, ListBoxItem } from "react-aria-components";

type Props = {
  "aria-label": string;
  options: PropertyOption[];
  selectedKey: string | null;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
  renderOption: (option: PropertyOption) => ReactNode;
};

const EMPTY_OPTION_ID = "__empty__";

export function SelectCellEditor({
  "aria-label": ariaLabel,
  options,
  selectedKey,
  onCommit,
  onCancel,
  renderOption,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitInProgressRef = useRef(false);
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedKey) ?? null,
    [options, selectedKey],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mx-1 my-0.5">
      <ComboBox
        aria-label={ariaLabel}
        selectedKey={selectedKey}
        inputValue={query}
        menuTrigger="focus"
        allowsEmptyCollection
        onInputChange={setQuery}
        onSelectionChange={(key) => {
          commitInProgressRef.current = true;

          if (!key || key === EMPTY_OPTION_ID) {
            onCommit(null);
            return;
          }

          onCommit(String(key));
        }}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            commitInProgressRef.current = false;
            return;
          }

          if (!commitInProgressRef.current) {
            onCancel();
          }
        }}
        className="w-full"
      >
        <div className="rounded-md border border-blue-200 bg-white shadow-sm ring-1 ring-blue-100">
          <Input
            ref={inputRef}
            autoFocus
            placeholder={selectedOption?.label ?? "Select an option"}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
            className="h-8 w-full rounded-md border-0 bg-transparent px-2.5 py-1 text-sm outline-none"
          />
        </div>

        <Popover className="w-(--trigger-width) p-1">
          <ListBox className="max-h-56 overflow-auto outline-none">
            <ListBoxItem
              id={EMPTY_OPTION_ID}
              textValue="-"
              className={({ isDisabled, isFocused }) =>
                `${dropdownItemStyles({ isDisabled, isFocused })} text-gray-500`
              }
            >
              -
            </ListBoxItem>
            {filteredOptions.map((option) => (
              <ListBoxItem
                key={option.id}
                id={option.id}
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
