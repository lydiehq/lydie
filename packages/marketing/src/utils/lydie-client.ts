import { LydieClient } from "@lydie-app/sdk/client"

export const lydieClient = new LydieClient({
	apiKey: import.meta.env.LYDIE_API_KEY,
	debug: true,
	organizationId: "WQnJeE7uYmhinDSE",
	apiUrl: "https://api.lydie.co/v1",
})
