// Utilities for handling errors from AI SDK chat endpoints.
// The AI SDK wraps backend errors as JSON strings in the error message.

export interface ParsedChatError {
  code?: string
  message: string
}

// Parses errors from the AI SDK that may contain JSON-encoded error details
export function parseChatError(error: any): ParsedChatError {
  const defaultMessage = "Failed to send message. Please try again."

  try {
    const rawMessage = error?.message || ""

    // Check if the error message is a JSON string
    if (rawMessage.startsWith("{")) {
      const errorData = JSON.parse(rawMessage)
      return {
        code: errorData.code,
        message: errorData.error || defaultMessage,
      }
    }

    // Return the raw message if it's not JSON
    return {
      message: rawMessage || defaultMessage,
    }
  } catch (e) {
    // JSON parsing failed, return default
    return {
      message: error?.message || defaultMessage,
    }
  }
}

// Checks if an error is a usage limit exceeded error
export function isUsageLimitError(error: any): boolean {
  const parsed = parseChatError(error)
  return parsed.code === "usage_limit_exceeded"
}
