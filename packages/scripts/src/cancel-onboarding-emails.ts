import { cancelOnboardingEmails } from "@lydie/core/onboarding";
import { db } from "@lydie/database";

async function main() {
  const userIdOrMail = process.argv[2];

  if (!userIdOrMail) {
    console.error("Please provide a user ID");
    console.log("Usage: bun run cancel-onboarding-emails <userId>");
    process.exit(1);
  }

  const userId = userIdOrMail.includes("@")
    ? (await db.query.usersTable.findFirst({ where: { email: userIdOrMail } }))?.id
    : userIdOrMail;

  if (!userId) {
    console.error("User not found");
    process.exit(1);
  }

  try {
    const result = await cancelOnboardingEmails(userId);
    console.log(`Successfully cancelled ${result.deleted} scheduled email(s) for user ${userId}`);
  } catch (error) {
    console.error("Error cancelling onboarding emails:", error);
    process.exit(1);
  }
}

void main();
