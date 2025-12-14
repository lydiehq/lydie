import { createContext, useContext, useState, type ReactNode } from "react";

type SelectedContentContextType = {
  focusedContent: string | null;
  setFocusedContent: (content: string | null) => void;
  clearFocusedContent: () => void;
};

const SelectedContentContext = createContext<SelectedContentContextType | null>(
  null
);

export function SelectedContentProvider({ children }: { children: ReactNode }) {
  const [focusedContent, setFocusedContent] = useState<string | null>(null);

  const clearFocusedContent = () => {
    setFocusedContent(null);
  };

  return (
    <SelectedContentContext.Provider
      value={{
        focusedContent,
        setFocusedContent,
        clearFocusedContent,
      }}
    >
      {children}
    </SelectedContentContext.Provider>
  );
}

export function useSelectedContent() {
  const context = useContext(SelectedContentContext);
  if (!context) {
    throw new Error(
      "useSelectedContent must be used within a SelectedContentProvider"
    );
  }
  return context;
}
