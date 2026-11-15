import type { ReactNode } from "react";

import { Button } from "../components/Button";
import { CloseRegular } from "../icons/mingcute";

// A small card at the bottom of the sidebar for something worth knowing that needs no room in
// the content: a title, a line or two, at most two actions, and a way to dismiss it.
export function SidebarNotice({
  title,
  children,
  actions,
  onDismiss,
  testId,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <div
      role="status"
      className="surface-depth mx-2 flex shrink-0 items-start gap-1 rounded-lg bg-surface py-2 pr-1.5 pl-2.5 text-xs"
      data-testid={testId}
    >
      <div className="min-w-0 grow">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-gray-500">{children}</p>
        {actions && <div className="mt-2 mb-0.5 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label="Dismiss"
          className="-mt-0.5 text-gray-500 hover:text-gray-700"
          onPress={onDismiss}
        >
          <CloseRegular />
        </Button>
      )}
    </div>
  );
}
