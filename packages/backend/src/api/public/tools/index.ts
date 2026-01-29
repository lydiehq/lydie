import { Hono } from "hono";

import { ConvertRoute } from "./convert";
import { GenerateOutlineRoute } from "./generate-outline";

export const ToolsRoute = new Hono()
  .route("/convert", ConvertRoute)
  .route("/generate-outline", GenerateOutlineRoute);
