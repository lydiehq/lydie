import { Command } from "cmdk";
import { cva } from "cva";

const itemClassName = cva({
  base: "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-3 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800 transition-colors duration-150",
  variants: {
    destructive: {
      true: "data-[selected=true]:text-red-600 text-red-500",
    },
  },
});

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconUrl?: string;
  action: () => void;
  destructive?: boolean;
  customClassName?: string;
}

interface CommandMenuItemProps {
  item: MenuItem;
  onSelect?: (item: MenuItem) => void;
}

export function CommandMenuItem({ item, onSelect }: CommandMenuItemProps) {
  const Icon = item.icon;

  return (
    <Command.Item
      key={item.id}
      onSelect={() => onSelect?.(item)}
      className={
        item.customClassName || itemClassName({ destructive: item.destructive })
      }
    >
      {item.iconUrl ? (
        <img
          src={item.iconUrl}
          alt=""
          className="size-4 mr-2 rounded-sm"
        />
      ) : (
        Icon && <Icon className="size-4 text-gray-400 mr-2" />
      )}
      <span className="truncate">{item.label}</span>
    </Command.Item>
  );
}
