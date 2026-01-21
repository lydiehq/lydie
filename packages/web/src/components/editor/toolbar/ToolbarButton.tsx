import { Editor } from "@tiptap/react"
import { Button as RACButton, type ButtonProps, TooltipTrigger } from "react-aria-components"
import { Tooltip } from "../../generic/Tooltip"
import type { ComponentType, SVGProps } from "react"

type Props = ButtonProps & {
	title: string
	editor: Editor
	icon: ComponentType<SVGProps<SVGSVGElement>>
	className?: string | ((props: { isSelected?: boolean }) => string)
	isDisabled?: boolean
	hotkeys?: string[]
}

export function ToolbarButton(props: Props) {
	const { className, isDisabled, hotkeys, ...rest } = props
	const isActive = props.editor.isActive(props.title.toLowerCase())
	const defaultClassName = `p-1.5 rounded hover:bg-gray-100 ${
		isActive ? "bg-gray-200" : ""
	} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`

	const computedClassName =
		typeof className === "function"
			? className({
					isSelected: isActive,
				})
			: className || defaultClassName

	return (
		<TooltipTrigger delay={500}>
			<RACButton
				{...rest}
				className={computedClassName}
				isDisabled={isDisabled}
				aria-label={props.title}
			>
				<props.icon className="size-[15px] text-gray-700" />
			</RACButton>
			<Tooltip placement="bottom" hotkeys={hotkeys}>
				{props.title}
			</Tooltip>
		</TooltipTrigger>
	)
}
