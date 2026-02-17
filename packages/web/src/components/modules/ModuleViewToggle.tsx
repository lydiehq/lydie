import { useState } from "react";

type ViewMode = "documents" | "table";

type Props = {
  initialMode?: ViewMode;
  onChange?: (mode: ViewMode) => void;
};

export function ModuleViewToggle({ initialMode = "documents", onChange }: Props) {
  const [mode, setMode] = useState<ViewMode>(initialMode);

  const handleChange = (newMode: ViewMode) => {
    setMode(newMode);
    onChange?.(newMode);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1">
      <button
        onClick={() => handleChange("documents")}
        className={`px-3 py-1 text-sm font-medium transition-colors rounded ${
          mode === "documents"
            ? "bg-gray-100 text-gray-900"
            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        }`}
      >
        Documents
      </button>
      <button
        onClick={() => handleChange("table")}
        className={`px-3 py-1 text-sm font-medium transition-colors rounded ${
          mode === "table"
            ? "bg-gray-100 text-gray-900"
            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        }`}
      >
        Table
      </button>
    </div>
  );
}
