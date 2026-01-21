import { logger } from "hono/logger"
import { ExternalApi } from "./external"
import { InternalApi } from "./internal"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { hocuspocus } from "../hocuspocus-server"
import { createNodeWebSocket } from "@hono/node-ws"

export const app = new Hono()
  .use(
    cors({
      origin: ["https://app.lydie.co", "https://lydie.co", "http://localhost:3000"],
      credentials: true,
    }),
  )
  .use(logger())
  .get("/", async (c) => {
    return c.text("ok")
  })
  .route("/internal", InternalApi)
  .route("/v1/:idOrSlug", ExternalApi)

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
})

app.get(
  "/yjs/:documentId",
  upgradeWebSocket((c) => {
    const documentId = c.req.param("documentId")

    return {
      onOpen(_evt, ws) {
        if (!ws.raw) {
          throw new Error("WebSocket not available")
        }
        hocuspocus.handleConnection(ws.raw, c.req.raw as any, documentId)
      },
    }
  }),
)

export type AppType = typeof app
