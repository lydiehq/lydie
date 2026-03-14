export type CollectionViewRecord = {
  id: string;
  name: string;
  type: "table" | "kanban";
  config?: {
    filters?: Record<string, string | number | boolean>;
    sortField?: string | null;
    sortDirection?: "asc" | "desc" | null;
  };
};

export function resolveSelectedViewId(
  selectedViewId: string | null,
  views: CollectionViewRecord[],
): string | null {
  if (selectedViewId && views.some((view) => view.id === selectedViewId)) {
    return selectedViewId;
  }

  return views[0]?.id ?? null;
}
