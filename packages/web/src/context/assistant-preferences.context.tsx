import { useAtom } from "jotai";
import { createContext, useCallback, useContext, type ReactNode } from "react";

import { selectedAgentIdAtom, selectedModelIdAtom } from "@/stores/assistant-preferences";

interface AssistantPreferencesContextValue {
  selectedAgentId: string | null;
  setSelectedAgentId: (agentId: string | null) => void;
  selectedModelId: string | null;
  setSelectedModelId: (modelId: string | null) => void;
}

const AssistantPreferencesContext = createContext<AssistantPreferencesContextValue | undefined>(
  undefined,
);

interface AssistantPreferencesProviderProps {
  children: ReactNode;
}

export function AssistantPreferencesProvider({ children }: AssistantPreferencesProviderProps) {
  const [selectedAgentId, setSelectedAgentIdAtom] = useAtom(selectedAgentIdAtom);
  const [selectedModelId, setSelectedModelIdAtom] = useAtom(selectedModelIdAtom);

  const setSelectedAgentId = useCallback(
    (agentId: string | null) => {
      setSelectedAgentIdAtom(agentId);
    },
    [setSelectedAgentIdAtom],
  );

  const setSelectedModelId = useCallback(
    (modelId: string | null) => {
      setSelectedModelIdAtom(modelId);
    },
    [setSelectedModelIdAtom],
  );

  const value: AssistantPreferencesContextValue = {
    selectedAgentId,
    setSelectedAgentId,
    selectedModelId,
    setSelectedModelId,
  };

  return (
    <AssistantPreferencesContext.Provider value={value}>
      {children}
    </AssistantPreferencesContext.Provider>
  );
}

export function useAssistantPreferences() {
  const context = useContext(AssistantPreferencesContext);
  if (context === undefined) {
    throw new Error("useAssistantPreferences must be used within an AssistantPreferencesProvider");
  }
  return context;
}
