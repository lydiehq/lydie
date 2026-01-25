import { LydieClient } from "@lydie-app/sdk/client";
import { Resource } from "sst";

export const lydieClient = new LydieClient({
  apiKey: Resource.LydieApiKey.value,
  debug: true,
  organizationId: "WQnJeE7uYmhinDSE",
  apiUrl: "https://api.lydie.co/v1",
});
