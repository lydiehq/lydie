import { cancelOnboardingEmails } from "@lydie/core/onboarding";

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Please provide a user ID");
    console.log("Usage: bun run cancel-onboarding-emails <userId>");
    process.exit(1);
  }

  console.log(`Cancelling onboarding emails for user: ${userId}\n`);

  try {
    const result = await cancelOnboardingEmails(userId);
    console.log(`Successfully cancelled ${result.deleted} scheduled email(s) for user ${userId}`);
  } catch (error) {
    console.error("Error cancelling onboarding emails:", error);
    process.exit(1);
  }
}

void main();
