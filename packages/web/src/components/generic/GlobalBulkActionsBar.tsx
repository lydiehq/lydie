import { Button } from "@lydie/ui/components/generic/Button";
import { useAtom } from "jotai";
import { useEffect } from "react";

import { globalBulkActionsAtom, initGlobalBulkActions } from "@/stores/global-bulk-actions";

export function GlobalBulkActionsBar() {
  const [state, setState] = useAtom(globalBulkActionsAtom);

  useEffect(() => {
    initGlobalBulkActions(setState);
  }, [setState]);

  return (
    <div
      className={`fixed left-1/2 bottom-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[10px] border border-white/20 bg-black/95 p-1 shadow-popover transition-all duration-200 ${
        state.isOpen
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <p className="ml-2 text-xs font-medium text-white">
        {state.selectionCount}{" "}
        {state.selectionCount === 1 ? state.selectionLabelSingular : state.selectionLabelPlural}{" "}
        selected
      </p>
      <div className="flex items-center gap-1">
        {state.actions.map((action) => (
          <Button
            key={action.id}
            intent={action.intent ?? "ghost"}
            size="sm"
            onPress={action.onAction}
            isDisabled={action.isDisabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
