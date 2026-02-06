import { createFreeWorkspaceBilling } from "./workspace-credits";

/**
 * Setup billing for a new organization
 * Creates free tier workspace billing and initial credits for the owner
 */
export async function setupOrganizationBilling(
  organizationId: string,
  organizationName: string,
  billingOwnerUserId: string,
) {
  // Create free tier billing for the workspace
  // This also creates initial credits for the billing owner
  await createFreeWorkspaceBilling(organizationId, billingOwnerUserId);

  console.log("Billing setup complete for organization:", {
    organizationId,
    organizationName,
    billingOwnerUserId,
    plan: "free",
  });
}
