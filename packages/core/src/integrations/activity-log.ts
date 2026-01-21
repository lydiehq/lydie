import { db, integrationActivityLogsTable } from "@lydie/database"

type ActivityType = "push" | "pull" | "connect" | "delete"

export async function logIntegrationActivity(
  connectionId: string,
  activityType: ActivityType,
  activityStatus: "success" | "error",
  integrationType: string,
) {
  await db.insert(integrationActivityLogsTable).values({
    connectionId,
    activityType,
    activityStatus,
    integrationType,
  })
}
