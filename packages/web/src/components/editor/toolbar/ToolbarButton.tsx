import type { ComponentType, SVGProps } from "react";

import { Editor } from "@tiptap/react";
import { type ButtonProps, Button as RACButton, TooltipTrigger } from "react-aria-components";

import { Tooltip } from "../../generic/Tooltip";

type Props = ButtonProps & {
  title: string;
  editor: Editor;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string | ((props: { isSelected?: boolean }) => string);
  isDisabled?: boolean;
  hotkeys?: string[];
  inverted?: boolean;
};

export function ToolbarButton(props: Props) {
  const { className, isDisabled, hotkeys, inverted, ...rest } = props;
  const isActive = props.editor.isActive(props.title.toLowerCase());

  const defaultClassName = inverted
    ? `flex p-1.5 flex rounded hover:bg-white/20 ${
        isActive ? "bg-white/30" : ""
      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`
    : `flex p-1.5 flex rounded hover:bg-gray-100 ${
        isActive ? "bg-gray-200" : ""
      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`;

  const computedClassName =
    typeof className === "function"
      ? className({
          isSelected: isActive,
        })
      : className || defaultClassName;

  const iconClassName = inverted ? "size-[15px] text-white" : "size-[15px] text-gray-700";

  return (
    <TooltipTrigger delay={500}>
      <RACButton
        {...rest}
        className={computedClassName}
        isDisabled={isDisabled}
        aria-label={props.title}
      >
        <props.icon className={iconClassName} />
      </RACButton>
      <Tooltip placement="bottom" hotkeys={hotkeys}>
        {props.title}
      </Tooltip>
    </TooltipTrigger>
  );
}
