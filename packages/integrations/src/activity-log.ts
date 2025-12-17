import { db, integrationActivityLogsTable } from "@lydie/database";

type ActivityType = "push" | "pull" | "connect";

export async function logIntegrationActivity(
  connectionId: string,
  activityType: ActivityType,
  activityStatus: "success" | "error"
) {
  await db.insert(integrationActivityLogsTable).values({
    connectionId,
    activityType,
    activityStatus,
  });
}
