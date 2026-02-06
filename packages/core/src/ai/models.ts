// LLM Model definitions for AI Gateway
// Models are defined with their AI Gateway paths (provider/model-name format)
// Credit costs are scaled to match billing system where pro users get 4000 credits

export type ModelProvider = "openai" | "google" | "anthropic" | "moonshotai";

export interface LLMModel {
  id: string;
  name: string;
  model: string;
  provider: ModelProvider;
  description: string;
  credits: number;
  isDefault?: boolean;
  isBeta?: boolean;
}

// Available LLM models with scaled credit costs
// Scaled for 4000 credits/month for pro users:
// - Entry models: 20-25 credits (~160-200 messages)
// - Mid-tier models: 35-45 credits (~90-115 messages)
// - Premium models: 50-60 credits (~65-80 messages)
export const AVAILABLE_MODELS: LLMModel[] = [
  // OpenAI
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    model: "openai/gpt-5-mini",
    provider: "openai",
    description: "Fast and cost-effective for everyday tasks",
    credits: 25,
    isDefault: true,
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    model: "openai/gpt-5.2",
    provider: "openai",
    description: "Most capable GPT-5 model for complex reasoning",
    credits: 50,
    isBeta: true,
  },

  // Google
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    model: "google/gemini-3-flash",
    provider: "google",
    description: "Fast model for everyday tasks",
    credits: 20,
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    model: "google/gemini-3-pro",
    provider: "google",
    description: "Google's most advanced model for complex tasks",
    credits: 45,
    isBeta: true,
  },

  // Anthropic
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    model: "anthropic/claude-sonnet-4-20250514",
    provider: "anthropic",
    description: "Anthropic's balanced model for complex tasks",
    credits: 40,
    isBeta: true,
  },
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    model: "anthropic/claude-opus-4-20250514",
    provider: "anthropic",
    description: "Anthropic's most powerful model",
    credits: 60,
    isBeta: true,
  },

  // Moonshot AI
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    model: "moonshotai/kimi-k2-5",
    provider: "moonshotai",
    description: "Efficient model with strong reasoning capabilities",
    credits: 35,
  },
];

// Get the default model
export function getDefaultModel(): LLMModel {
  const defaultModel = AVAILABLE_MODELS.find((m) => m.isDefault);
  if (defaultModel) return defaultModel;
  const firstModel = AVAILABLE_MODELS[0];
  if (firstModel) return firstModel;
  throw new Error("No models available");
}

// Get a model by its ID
export function getModelById(id: string): LLMModel | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

// Get all models
export function getAllModels(): LLMModel[] {
  return AVAILABLE_MODELS;
}

// Get models grouped by provider
export function getModelsByProvider(): Map<ModelProvider, LLMModel[]> {
  const grouped = new Map<ModelProvider, LLMModel[]>();

  for (const model of AVAILABLE_MODELS) {
    const existing = grouped.get(model.provider) || [];
    existing.push(model);
    grouped.set(model.provider, existing);
  }

  return grouped;
}

// Get provider display name
export function getProviderDisplayName(provider: ModelProvider): string {
  const names: Record<ModelProvider, string> = {
    openai: "OpenAI",
    google: "Google",
    anthropic: "Anthropic",
    moonshotai: "Moonshot AI",
  };
  return names[provider];
}

// Get provider order for consistent UI display
export function getProviderOrder(): ModelProvider[] {
  return ["openai", "anthropic", "google", "moonshotai"];
}
