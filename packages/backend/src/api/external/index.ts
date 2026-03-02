import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";

import { CollectionsApi } from "./collections";

/**
 * External API - For external consumers using API keys
 * Mounted at /api/v1
 * Uses API key authentication
 */
const externalApi = new Hono().route("/", CollectionsApi);

externalApi.get(
  "/openapi.json",
  openAPIRouteHandler(externalApi, {
    documentation: {
      info: {
        title: "Lydie External Collections API",
        version: "v1",
        description: "REST API for collection documents and collection lookup settings.",
      },
      servers: [{ url: "/api/v1" }],
    },
  }),
);

export const ExternalApi = externalApi;
