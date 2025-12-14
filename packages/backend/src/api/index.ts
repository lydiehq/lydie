import { handle, streamHandle } from "hono/aws-lambda";
import { app } from "./app";
import { Resource } from "sst";

export const handler =
  Resource.App.stage === "production" ? streamHandle(app) : handle(app);
export type AppType = typeof app;
