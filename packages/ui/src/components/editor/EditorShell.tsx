import { type ReactNode } from "react";
import clsx from "clsx";

export interface EditorShellProps {
  toolbar?: ReactNode;
  isLocked?: boolean;
  lockedNotice?: string;
  children: ReactNode;
  shouldShiftContent?: boolean;
  className?: string;
}

export function EditorShell({
  toolbar,
  isLocked,
  lockedNotice,
  children,
  shouldShiftContent,
  className,
}: EditorShellProps) {
  return (
    <div
      className={clsx(
        "overflow-hidden flex flex-col grow relative size-full",
        className
      )}
      data-testid="editor-shell"
    >
      {toolbar}
      
      {isLocked && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
          {lockedNotice || "This page is locked and cannot be edited."}
        </div>
      )}

      <div className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white">
        <div className="flex mx-auto grow max-w-[65ch] px-4 flex-col pt-12 shrink-0">
          {children}
        </div>

        {/* Content shift spacer for assistant panel */}
        <div
          className={clsx(
            "shrink-0 transition-[width] duration-500 ease-in-out",
            shouldShiftContent ? "max-2xl:w-[170px]" : "w-0"
          )}
        />
      </div>
    </div>
  );
}
