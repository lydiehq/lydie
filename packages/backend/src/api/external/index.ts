import { Hono } from "hono";

import { CollectionsApi } from "./collections";

/**
 * External API - For external consumers using API keys
 * Mounted at /api/v1
 * Uses API key authentication
 */
export const ExternalApi = new Hono().route("/", CollectionsApi);
