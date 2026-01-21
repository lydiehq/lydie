import { google } from "@lydie/core/ai/llm"
import { generateText, type UIMessage } from "ai"

export async function generateConversationTitle(message: UIMessage) {
	const { text: title } = await generateText({
		model: google("gemini-2.5-flash-lite-preview-09-2025"),
		system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 40 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
		prompt: JSON.stringify(message),
	})

	return title
}
