export type CollectionViewRecord = {
  id: string;
  name: string;
  type: "table" | "list" | "kanban";
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
