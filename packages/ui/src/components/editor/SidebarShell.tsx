import type { ReactNode } from "react";

import clsx from "clsx";

export interface SidebarShellProps {
  header?: ReactNode;
  quickActions?: ReactNode;
  navigation?: ReactNode;
  documentsHeader?: ReactNode;
  documentsTree?: ReactNode;
  usageStats?: ReactNode;
  bottom?: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function SidebarShell({
  header,
  quickActions,
  navigation,
  documentsHeader,
  documentsTree,
  usageStats,
  bottom,
  isCollapsed,
  className,
}: SidebarShellProps) {
  return (
    <div className={clsx("flex flex-col grow max-h-screen", className)}>
      {header}

      <div
        className={clsx("flex flex-col gap-y-4 pb-2", isCollapsed ? "hidden" : "", "grow min-h-0")}
      >
        {quickActions && <div className="flex gap-x-1 px-3">{quickActions}</div>}

        {navigation && <div className="flex flex-col px-2">{navigation}</div>}

        {(documentsHeader || documentsTree) && (
          <div className="flex flex-col grow min-h-0">
            {documentsHeader}
            <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
              {documentsTree}
            </div>
          </div>
        )}

        {usageStats && <div className="px-2">{usageStats}</div>}
        {bottom}
      </div>
    </div>
  );
}
