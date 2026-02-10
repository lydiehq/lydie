import { AnimatePresence, motion } from "motion/react";

import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";

type SearchItem = {
  label: string;
  selected?: boolean;
  icon?: "search" | "document";
};

type SearchSection = {
  title: string;
  items: SearchItem[];
};

type SearchIllustrationProps = {
  query?: string;
  placeholder?: string;
  sections: SearchSection[];
  showKeyboardHelp?: boolean;
  className?: string;
};

export function SearchIllustration({
  query,
  placeholder = "Type a command or search...",
  sections,
  showKeyboardHelp = true,
  className = "",
}: SearchIllustrationProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`absolute inset-0 z-30 flex items-start justify-center pt-16 px-4 ${className}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/25 backdrop-blur-[1px]" />

      {/* Command Menu */}
      <div className="relative w-full max-w-xl rounded-xl shadow-popover bg-gray-50 overflow-hidden">
        <div className="flex items-center border-b border-gray-100 px-3 bg-white">
          <svg
            className="size-4 text-gray-400 mr-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            readOnly
            className="flex h-11 w-full border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {sections.map((section, sectionIndex) => (
            <div key={section.title}>
              <div
                className={`px-3 py-1 text-xs font-medium text-gray-500 text-left ${sectionIndex > 0 ? "mt-2" : ""}`}
              >
                {section.title}
              </div>
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={`relative flex cursor-pointer select-none items-center rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-150 ${
                    item.selected ? "bg-gray-100 text-gray-950" : "text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  {item.icon === "document" ? (
                    <DocumentIcon className="size-4 text-gray-400 mr-2" />
                  ) : (
                    <svg
                      className="size-4 text-gray-400 mr-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Keyboard help footer */}
        {showKeyboardHelp && (
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 bg-white text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↵</kbd>
                <span>to select</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↑↓</kbd>
                <span>to navigate</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export type { SearchIllustrationProps, SearchSection, SearchItem };
