import { db, schema } from "@lydie/database";
import { createId } from "./id";

interface CreateOrganizationParams {
  organizationId?: string;
  name: string;
  slug: string;
  userId: string;
  logo?: string;
  metadata?: string;
}

export async function createOrganization(params: CreateOrganizationParams) {
  const organizationId = params.organizationId || createId();

  // Create the organization
  await db.insert(schema.organizationsTable).values({
    id: organizationId,
    name: params.name,
    slug: params.slug,
    logo: params.logo || null,
    metadata: params.metadata || null,
    subscriptionStatus: "free",
    subscriptionPlan: "free",
  });

  // Add user as owner
  const memberId = createId();
  await db.insert(schema.membersTable).values({
    id: memberId,
    organizationId: organizationId,
    userId: params.userId,
    role: "owner",
  });

  // Create default organization settings
  const settingsId = createId();
  await db.insert(schema.organizationSettingsTable).values({
    id: settingsId,
    organizationId: organizationId,
  });

  return {
    organizationId,
    memberId,
    settingsId,
  };
}
