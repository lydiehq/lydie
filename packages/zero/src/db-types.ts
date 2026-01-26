import { db } from "@lydie/database";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

import { schema } from "./schema";

type DBProvider = ReturnType<typeof zeroDrizzle<typeof schema, typeof db>>;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: DBProvider;
  }
}
