import { SearchIcon, XIcon } from "@/icons"
import {
	SearchField as AriaSearchField,
	Button,
	Group,
	Input,
	Label,
	type SearchFieldProps as AriaSearchFieldProps,
	type ValidationResult,
} from "react-aria-components"
import { composeTailwindRenderProps } from "./utils"
import type { RefObject } from "react"

export interface SearchFieldProps extends AriaSearchFieldProps {
	label?: string
	description?: string
	errorMessage?: string | ((validation: ValidationResult) => string)
	placeholder?: string
	inputRef?: RefObject<HTMLInputElement | null>
}

export function SearchField({
	label,
	description,
	errorMessage,
	placeholder,
	inputRef,
	...props
}: SearchFieldProps) {
	return (
		<AriaSearchField
			{...props}
			className={composeTailwindRenderProps(props.className, "group flex flex-col gap-1 min-w-[40px]")}
		>
			{label && <Label>{label}</Label>}
			<Group className="flex items-center bg-gray-100 rounded-lg ">
				<SearchIcon aria-hidden className="size-4 ml-2 text-gray-500 " />
				<Input
					ref={inputRef}
					placeholder={placeholder}
					className="[&::-webkit-search-cancel-button]:hidden focus:outline-none grow px-2 py-2 text-sm text-gray-700"
				/>
				<Button className="mr-1 w-6 group-empty:invisible">
					<XIcon aria-hidden className="w-4 h-4" />
				</Button>
			</Group>
		</AriaSearchField>
	)
}
