import type { ComponentType } from "react";

import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { clsx } from "clsx";

// Icon components matching the app
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function AddIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PublishIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function AssistantIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IntegrationsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export const COMMAND_MENU_ICONS = {
  search: SearchIcon,
  document: DocumentIcon,
  add: AddIcon,
  publish: PublishIcon,
  home: HomeIcon,
  assistant: AssistantIcon,
  settings: SettingsIcon,
  integrations: IntegrationsIcon,
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
