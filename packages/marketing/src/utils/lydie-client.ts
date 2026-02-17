import { LydieClient } from "@lydie-app/sdk/client";
import { Resource } from "sst";

const isProduction = Resource.App.stage === "production" || true;

export const lydieClient = new LydieClient({
  apiKey: isProduction ? Resource.LydieApiKey.value : "lydie_test_rWCzeEgVy2KhZe33",
  debug: true,
  organizationId: isProduction ? "WQnJeE7uYmhinDSE" : "larss-workspace-psvnnuyg",
  apiUrl: isProduction ? "https://api.lydie.co/v1" : "http://localhost:3001/v1",
});
