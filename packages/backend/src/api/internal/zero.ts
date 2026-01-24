import { Hono } from "hono"
import { handleQueryRequest } from "@rocicorp/zero/server"
import { mustGetQuery } from "@rocicorp/zero"
import { schema } from "@lydie/zero/schema"
import { queries, type QueryContext } from "@lydie/zero/queries"
import { authClient } from "@lydie/core/auth"
import { HTTPException } from "hono/http-exception"
import { createServerMutators } from "@lydie/zero/server-mutators"
import { handleMutateRequest } from "@rocicorp/zero/server"
import { mustGetMutator } from "@rocicorp/zero"
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle"
import { db as drizzleClient } from "@lydie/database"

const zeroDbProvider = zeroDrizzle(schema, drizzleClient)

export const ZeroRoute = new Hono()
  .post("/queries", async (c) => {
    const sessionData = await authClient.api.getSession(c.req.raw)

    if (!sessionData?.session) {
      throw new HTTPException(401, {
        message: "Unauthorized",
      })
    }

    const session = sessionData.session as QueryContext

    const result = await handleQueryRequest(
      (name, args) => {
        const query = mustGetQuery(queries, name)
        return query.fn({ args, ctx: session })
      },
      schema,
      c.req.raw,
    )

    return c.json(result)
  })
  .post("/mutate", async (c) => {
    const sessionData = await authClient.api.getSession(c.req.raw)
    if (!sessionData?.session) {
      throw new HTTPException(401, {
        message: "Unauthorized",
      })
    }

    const session = sessionData.session

    const asyncTasks: Array<() => Promise<void>> = []
    const mutators = createServerMutators(asyncTasks)

    const result = await handleMutateRequest(
      zeroDbProvider,
      (transact) =>
        transact((tx, name, args) => {
          const mutator = mustGetMutator(mutators, name)
          return mutator.fn({
            // @ts-ignore TODO: would be fixed once we are able to use
            // drizzle-zero (once drizzle v1 is supported)
            tx,
            ctx: session,
            args,
          })
        }),
      c.req.raw,
    )

    await Promise.allSettled(asyncTasks.map((task) => task()))
    return c.json(result)
  })
