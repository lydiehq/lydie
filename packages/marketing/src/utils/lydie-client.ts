import { LydieClient } from "@lydie-app/sdk/client";
import { Resource } from "sst";

// const isProduction = Resource.App.stage === "production";
const isProduction = true;

export const lydieClient = new LydieClient({
  apiKey: isProduction ? Resource.LydieApiKey.value : "lydie_test_rWCzeEgVy2KhZe33",
  debug: true,
  organizationId: isProduction ? "lydie" : "larss-workspace-psvnnuyg",
  apiUrl: isProduction ? "https://api.lydie.co/v1" : "http://localhost:3001/v1",
});
