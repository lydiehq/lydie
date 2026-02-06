import { getDefaultModel } from "@lydie/core/ai/models";
import { atomWithStorage } from "jotai/utils";

// Default agent is null (uses system default)
const DEFAULT_AGENT_ID: string | null = null;

// Default model is the system default model
const DEFAULT_MODEL_ID = getDefaultModel().id;

// Persisted atom for selected AI agent
export const selectedAgentIdAtom = atomWithStorage<string | null>(
  "lydie-assistant-selected-agent",
  DEFAULT_AGENT_ID,
);

// Persisted atom for selected AI model
export const selectedModelIdAtom = atomWithStorage<string | null>(
  "lydie-assistant-selected-model",
  DEFAULT_MODEL_ID,
);
