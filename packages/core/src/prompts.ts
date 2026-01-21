/**
 * AI writing prompt styles and utilities.
 * Shared across backend and frontend packages.
 */

export type PromptStyle = "default" | "journalistic" | "essay"

export interface PromptStyleDefinition {
  value: PromptStyle
  label: string
  description: string
  prompt: string
}

/**
 * Returns the prompt text for a given style.
 */
export function getPromptStyleText(style: PromptStyle | null | undefined): string {
  switch (style) {
    case "journalistic":
      return "You are a skilled journalistic writer. Write with precision, clarity, and objectivity. Present facts clearly and structure your writing to inform readers effectively. Use active voice and concise language. Prioritize accuracy and readability."
    case "essay":
      return "You are a skilled essay writer. Write with depth, insight, and scholarly rigor. Build coherent arguments with clear structure and logical flow. Use precise language and thoughtful analysis. Balance evidence with interpretation."
    case "default":
    default:
      return "You are a calm, confident, and thoughtful writing assistant. Avoid clichés, hype, and filler. Write with clarity, purpose, and craft. Your tone is reflective and grounded — focused on meaning, not trends. Every word should serve the message. Speak to the reader as an equal who values substance."
  }
}

/**
 * All available prompt styles with their definitions.
 */
export const PROMPT_STYLES: PromptStyleDefinition[] = [
  {
    value: "default",
    label: "Default",
    description: "Calm, confident, and thoughtful. Reflective and grounded, focused on meaning.",
    prompt: getPromptStyleText("default"),
  },
  {
    value: "journalistic",
    label: "Journalistic",
    description:
      "Precise, clear, and objective. Presents facts effectively with active voice and concise language.",
    prompt: getPromptStyleText("journalistic"),
  },
  {
    value: "essay",
    label: "Essay",
    description:
      "Deep, insightful, and scholarly. Builds coherent arguments with clear structure and thoughtful analysis.",
    prompt: getPromptStyleText("essay"),
  },
] as const
