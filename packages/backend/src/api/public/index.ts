import { Hono } from "hono";

import { publicRateLimit } from "./middleware";
import TemplateInstallRoute from "./template-install";
import { ToolsRoute } from "./tools";

export const PublicApi = new Hono()
  .use(publicRateLimit)
  .route("/template-install", TemplateInstallRoute)
  .route("/tools", ToolsRoute);
