import type { RefObject } from "react";
import {
  Button,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  type ValidationResult,
} from "react-aria-components";

import { CloseRegular, Search2Regular } from "../icons/mingcute";
import { buttonStyles } from "./Button";
import { FieldGroup, type FieldSize, groupedInputClass, Input, Label } from "./Field";
import { composeTailwindRenderProps } from "./utils";

export interface SearchFieldProps extends AriaSearchFieldProps {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  size?: FieldSize;
}

export function SearchField({
  label,
  description: _description,
  errorMessage: _errorMessage,
  placeholder,
  inputRef,
  size = "md",
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "group flex flex-col gap-1 min-w-[40px]",
      )}
    >
      {label && <Label>{label}</Label>}
      <FieldGroup>
        <Search2Regular
          aria-hidden
          className={`size-4 shrink-0 text-gray-500 ${size === "sm" ? "ml-2.5" : "ml-3"}`}
        />
        <Input
          ref={inputRef}
          size={size}
          placeholder={placeholder}
          className={`[&::-webkit-search-cancel-button]:hidden pl-2 ${groupedInputClass}`}
        />
        {/* react-aria's own clear button (the field's slot), in the ghost button look. */}
        {/* oxlint-disable-next-line lydie/icon-button-tooltip */}
        <Button
          className={buttonStyles({
            variant: "ghost",
            size: size === "sm" ? "icon-2xs" : "icon-xs",
            className: "mr-1.5 group-empty:invisible",
          })}
        >
          <CloseRegular aria-hidden />
        </Button>
      </FieldGroup>
    </AriaSearchField>
  );
}
