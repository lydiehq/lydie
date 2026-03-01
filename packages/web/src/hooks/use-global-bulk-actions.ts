import { useEffect, useId } from "react";

import {
  hideGlobalBulkActions,
  showGlobalBulkActions,
  type GlobalBulkAction,
} from "@/atoms/global-bulk-actions";

type UseGlobalBulkActionsOptions = {
  selectionCount: number;
  actions: GlobalBulkAction[];
  selectionLabelSingular?: string;
  selectionLabelPlural?: string;
};

export function useGlobalBulkActions(options: UseGlobalBulkActionsOptions) {
  const ownerId = useId();

  useEffect(() => {
    if (options.selectionCount > 0) {
      showGlobalBulkActions({
        ownerId,
        selectionCount: options.selectionCount,
        selectionLabelSingular: options.selectionLabelSingular,
        selectionLabelPlural: options.selectionLabelPlural,
        actions: options.actions,
      });
      return;
    }

    hideGlobalBulkActions(ownerId);
  }, [
    ownerId,
    options.actions,
    options.selectionCount,
    options.selectionLabelPlural,
    options.selectionLabelSingular,
  ]);

  useEffect(() => {
    return () => {
      hideGlobalBulkActions(ownerId);
    };
  }, [ownerId]);
}
