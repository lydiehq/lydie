import { Hono } from "hono";

import { ConvertRoute } from "./convert";
import { GenerateOutlineRoute } from "./generate-outline";
import { GenerateSummaryRoute } from "./generate-summary";

export const ToolsRoute = new Hono()
  .route("/convert", ConvertRoute)
  .route("/generate-outline", GenerateOutlineRoute)
  .route("/generate-summary", GenerateSummaryRoute);
