import {
  AddRegular,
  ArrowUploadRegular,
  BotRegular,
  HomeRegular,
  PaymentRegular,
  PlugConnectedRegular,
  SearchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { clsx } from "clsx";
import type { ComponentType } from "react";

// Icon components matching the real command menu
export const COMMAND_MENU_ICONS = {
  search: SearchRegular,
  document: DocumentIcon,
  add: AddRegular,
  publish: ArrowUploadRegular,
  home: HomeRegular,
  assistant: BotRegular,
  settings: SettingsRegular,
  billing: PaymentRegular,
  integrations: PlugConnectedRegular,
} as const;

export type CommandMenuIconType = keyof typeof COMMAND_MENU_ICONS;

export interface CommandMenuItem {
  id: string;
  label: string;
  icon?: CommandMenuIconType | ComponentType<{ className?: string }>;
  iconUrl?: string;
  selected?: boolean;
  destructive?: boolean;
}

export interface CommandMenuSection {
  id: string;
  heading: string;
  items: CommandMenuItem[];
}

export interface CommandMenuIllustrationProps {
  query?: string;
  placeholder?: string;
  sections: CommandMenuSection[];
  showKeyboardHelp?: boolean;
  showEmptyState?: boolean;
  className?: string;
  contentClassName?: string;
  maxHeight?: string;
}

export function CommandMenuIllustration({
  query,
  placeholder = "Type a command or search...",
  sections,
  showKeyboardHelp = true,
  showEmptyState = false,
  className = "",
  contentClassName = "",
  maxHeight = "320px",
}: CommandMenuIllustrationProps) {
  const SearchIcon = COMMAND_MENU_ICONS.search;

  return (
    <div
      className={clsx(
        "w-full rounded-xl shadow-popover bg-gray-50 overflow-hidden flex flex-col",
        className,
      )}
    >
      {/* Search header */}
      <div className="flex items-center border-b border-gray-100 px-3 bg-white shrink-0">
        <SearchIcon className="size-4 shrink-0 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          readOnly
          className="flex h-11 w-full min-w-0 border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      {/* Content area */}
      <div className={clsx("flex-1 overflow-y-auto p-2", contentClassName)} style={{ maxHeight }}>
        {showEmptyState ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            No results found.
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.id} className="mb-2 last:mb-0">
              <div className="px-3 mb-1 text-xs font-medium text-gray-500">{section.heading}</div>
              {section.items.map((item) => {
                const IconComponent =
                  typeof item.icon === "string" ? COMMAND_MENU_ICONS[item.icon] : item.icon;

                return (
                  <div
                    key={item.id}
                    className={clsx(
                      "relative flex select-none items-center gap-2 rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-75",
                      item.selected
                        ? "bg-gray-100 text-gray-950"
                        : "text-gray-800 hover:bg-gray-100",
                      item.destructive && "text-red-500 hover:text-red-600 focus:text-red-600",
                    )}
                  >
                    {item.iconUrl ? (
                      <img src={item.iconUrl} alt="" className="size-4 rounded-sm shrink-0" />
                    ) : IconComponent ? (
                      <IconComponent
                        className={clsx(
                          "size-4 shrink-0",
                          item.destructive ? "text-red-400" : "text-gray-400",
                        )}
                      />
                    ) : null}
                    <span className="flex-1 min-w-0 truncate text-start">{item.label}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Keyboard help footer */}
      {showKeyboardHelp && (
        <div className="flex-none border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center gap-x-2 bg-white shrink-0">
          <div className="flex gap-x-1 items-center">
            <kbd className="inline-flex h-5 select-none items-center rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600">
              ↑↓
            </kbd>
            <span>Navigate</span>
          </div>
          <div className="h-3 w-px bg-gray-200" />
          <div className="flex gap-x-1 items-center">
            <kbd className="inline-flex h-5 select-none items-center rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600">
              ↵
            </kbd>
            <span>Select</span>
          </div>
        </div>
      )}
    </div>
  );
}
