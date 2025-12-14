import { Button } from "@/components/generic/Button";
import React from "react";

export interface ToolAction {
  label: string;
  onPress: () => void;
  intent?: "primary" | "secondary";
  disabled?: boolean;
  pending?: boolean;
}

export interface ToolContainerProps {
  children: React.ReactNode;
  title?: string;
  actions?: ToolAction[];
  className?: string;
}

export function ToolContainer({
  children,
  title,
  actions = [],
  className = "",
}: ToolContainerProps) {
  const hasTitle = !!(title || actions.length > 0);

  return (
    <div
      data-tool-container
      data-has-title={hasTitle ? "true" : undefined}
      className={`bg-gray-100 rounded-lg ring ring-black/4 mt-2 first:mt-0
        [&:not([data-has-title])+[data-tool-container]:not([data-has-title])]:mt-0
        [&:not([data-has-title])+[data-tool-container]:not([data-has-title])]:rounded-t-none
        [&:not([data-has-title]):has(+[data-tool-container]:not([data-has-title]))]:rounded-b-none
        [&:not([data-has-title])+[data-tool-container]:not([data-has-title])>div:last-child]:rounded-t-none
        [&:not([data-has-title]):has(+[data-tool-container]:not([data-has-title]))>div:last-child]:rounded-b-none
        [&:not(:has(+[data-tool-container]))]:mb-2
        ${className}`}
    >
      {hasTitle && (
        <div className="flex justify-between items-center">
          <div className="pl-2 py-1">
            {title && <span className="text-xs text-gray-500">{title}</span>}
          </div>
          <div className="pr-1 py-1 flex gap-x-1">
            {actions.map((action, index) => (
              <Button
                key={index}
                onPress={action.onPress}
                isDisabled={action.disabled}
                isPending={action.pending}
                intent={
                  action.intent === "secondary"
                    ? "ghost"
                    : action.intent === "primary"
                    ? "secondary"
                    : action.intent
                }
                size="xs"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`bg-white ring ring-black/8 size-full grow p-2 ${
          hasTitle ? "rounded-t-lg rounded-b-lg" : "rounded-lg"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
