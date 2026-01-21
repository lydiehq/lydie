import { processScheduledEmail } from "@lydie/core/onboarding"

interface ScheduledEmailEvent {
	userId: string
	email: string
	fullName: string
	emailType: "checkin" | "feedback"
}

export async function handler(event: ScheduledEmailEvent) {
	console.log("Processing scheduled onboarding email:", event)

	try {
		await processScheduledEmail(event)
		return {
			statusCode: 200,
			body: JSON.stringify({
				message: "Email sent successfully",
				emailType: event.emailType,
			}),
		}
	} catch (error) {
		console.error("Error sending scheduled email:", error)
		throw error
	}
}
