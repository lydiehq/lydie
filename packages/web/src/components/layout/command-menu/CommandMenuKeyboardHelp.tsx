interface CommandMenuKeyboardHelpProps {
  showBack?: boolean;
}

export function CommandMenuKeyboardHelp({ showBack }: CommandMenuKeyboardHelpProps) {
  return (
    <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center gap-x-2">
      <div className="flex gap-x-1 items-center">
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
          ↑↓
        </kbd>
        Navigate
      </div>
      <div className="h-3 w-px bg-gray-200" />
      <div className="flex gap-x-1 items-center">
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
          ↵
        </kbd>
        Select
      </div>
      {showBack && (
        <>
          <div className="h-3 w-px bg-gray-200" />
          <div className="flex gap-x-1 items-center">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
              Esc
            </kbd>
            Back
          </div>
        </>
      )}
    </div>
  );
}
