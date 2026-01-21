import { composeRenderProps } from "react-aria-components"
import { twMerge } from "tailwind-merge"
import { cva } from "cva"

export const focusRing = cva({
	base: "outline outline-blue-600 dark:outline-blue-500 outline-offset-2",
	variants: {
		isFocusVisible: {
			false: "outline-0",
			true: "outline-2",
		},
	},
})

export function composeTailwindRenderProps<T>(
	className: string | ((v: T) => string) | undefined,
	tw: string,
): string | ((v: T) => string) {
	return composeRenderProps(className, (className) => twMerge(tw, className))
}
