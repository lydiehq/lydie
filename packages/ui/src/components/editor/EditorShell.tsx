import clsx from "clsx";
import { type ReactNode } from "react";

export interface EditorShellProps {
  toolbar?: ReactNode;
  children: ReactNode;
  shouldShiftContent?: boolean;
  className?: string;
}

export function EditorShell({
  toolbar,
  children,
  shouldShiftContent,
  className,
}: EditorShellProps) {
  return (
    <div
      className={clsx("overflow-hidden flex flex-col grow relative size-full", className)}
      data-testid="editor-shell"
    >
      {toolbar}

      <div className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white">
        <div className="flex mx-auto grow max-w-[65ch] px-4 flex-col pt-12 shrink-0">
          {children}
        </div>

        {/* Content shift spacer for assistant panel */}
        <div
          className={clsx(
            "shrink-0 transition-[width] duration-500 ease-in-out",
            shouldShiftContent ? "max-2xl:w-[170px]" : "w-0",
          )}
        />
      </div>
    </div>
  );
}
