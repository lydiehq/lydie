import { Hono } from "hono";

import { aiToolsRateLimit } from "../middleware";
import { ConvertRoute } from "./convert";
import { GenerateOutlineRoute } from "./generate-outline";
import { GenerateSummaryRoute } from "./generate-summary";
import { GenerateTitleRoute } from "./generate-title";

export const ToolsRoute = new Hono()
  .use("/generate-outline*", aiToolsRateLimit)
  .use("/generate-summary*", aiToolsRateLimit)
  .use("/generate-title*", aiToolsRateLimit)
  .route("/convert", ConvertRoute)
  .route("/generate-outline", GenerateOutlineRoute)
  .route("/generate-summary", GenerateSummaryRoute)
  .route("/generate-title", GenerateTitleRoute);
