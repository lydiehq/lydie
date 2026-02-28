import { Button } from "@lydie/ui/components/generic/Button";

type Props = {
  actionLabel: string;
  onAction: () => void;
  message?: string;
};

export function SidebarTreeEmptyState({
  actionLabel,
  onAction,
  message = "Seems empty here.",
}: Props) {
  return (
    <div className="flex flex-col items-start gap-y-2 rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-3">
      <p className="text-xs text-gray-500">{message}</p>
      <Button intent="secondary" size="sm" onPress={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
