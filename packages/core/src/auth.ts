import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, schema } from "@lydie/database";
import { betterAuth } from "better-auth";
import { admin, customSession, organization, testUtils } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { syncSubscriptionQuantity } from "./billing/seat-management";
import { createMemberCredits, markMemberAsRemoved } from "./billing/workspace-credits";
import { sendEmail } from "./email";
import { env, requireEnv } from "./env";
import { createId } from "./id";
import { scheduleOnboardingEmails } from "./onboarding";

export const authClient = betterAuth({
  logger: {
    level: "debug",
  },
  rateLimit: {
    enabled: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  baseURL: env.BETTER_AUTH_BASE_URL,
  secret: requireEnv(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.usersTable,
      verification: schema.verificationsTable,
      session: schema.sessionsTable,
      account: schema.accountsTable,
      organization: schema.organizationsTable,
      member: schema.membersTable,
      invitation: schema.invitationsTable,
    },
  }),
  socialProviders: {
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
  },
  trustedOrigins:
    env.APP_STAGE === "production"
      ? ["https://lydie.co", "https://api.lydie.co", "https://app.lydie.co"]
      : [
          "http://localhost:3001",
          "http://localhost:3000",
          ...(env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(",") : []),
        ],
  advanced: {
    // Production (HTTPS, same-origin via ALB): secure cookies with partitioning
    // Docker e2e (HTTP, same-origin via nginx): browser defaults (SECURE_COOKIES=false)
    // Local dev / Docker dev (cross-origin SPA↔API): sameSite=none + secure
    //   (Chrome treats localhost as a secure context, so Secure cookies work over HTTP)
    defaultCookieAttributes: !env.SECURE_COOKIES
      ? {}
      : env.APP_STAGE === "production"
        ? {
            secure: true,
            partitioned: true,
          }
        : {
            sameSite: "none",
            secure: true,
            partitioned: true,
          },
    crossSubDomainCookies: {
      enabled: true,
      domain: env.APP_STAGE === "production" ? ".lydie.co" : ".localhost",
    },
  },
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await sendEmail({
            to: "lars@salling.me",
            subject: "New user signed up to Lydie",
            html: `<p>New user signed up to Lydie: ${user.email}</p>`,
          });

          const fullName = user.name || user.email.split("@")[0] || "My";
          const firstName = fullName.split(" ")[0];

          await scheduleOnboardingEmails({
            userId: user.id,
            email: user.email,
            fullName: user.name || `${firstName}`,
          });

          const existingSettings = await db
            .select()
            .from(schema.userSettingsTable)
            .where(eq(schema.userSettingsTable.userId, user.id))
            .limit(1);

          if (existingSettings.length === 0) {
            await db.insert(schema.userSettingsTable).values({
              id: createId(),
              userId: user.id,
            });
          }
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    organization({
      // Use Better-Auth's default invitation system
      // Invitations are now handled via standard Better-Auth flows
      sendInvitationEmail: async (data) => {
        // Send invitation email via our email system
        // TODO: Implement email sending for invitations
        console.log("Invitation email would be sent to:", data.email);
      },

      // Simplified organization hooks - no seat-based logic
      organizationHooks: {
        // After adding a member, create their credit record and sync billing
        afterAddMember: async ({ member, organization }) => {
          const userId = member.userId;
          if (!userId) {
            console.warn("Cannot create credits for member without userId");
            return;
          }

          // Create credit record for the new member
          try {
            await createMemberCredits(userId, organization.id);
            console.log(`Created credit record for member ${userId} in org ${organization.id}`);
          } catch (error) {
            console.error("Error creating member credits:", error);
          }

          // Sync subscription quantity to charge for the new seat
          try {
            await syncSubscriptionQuantity(organization.id);
            console.log(
              `Synced subscription quantity for org ${organization.id} after adding member`,
            );
          } catch (error) {
            console.error("Error syncing subscription quantity after adding member:", error);
          }
        },

        // After removing a member, sync billing and mark their credits as removed
        afterRemoveMember: async ({ member, organization }) => {
          const userId = member.userId;
          if (!userId) {
            console.warn("Cannot mark credits for member without userId");
            return;
          }

          // Mark credit record as removed (preserves historical data)
          try {
            await markMemberAsRemoved(userId, organization.id);
            console.log(`Marked member ${userId} as removed in org ${organization.id}`);
          } catch (error) {
            console.error("Error marking member as removed:", error);
          }

          // Sync subscription quantity to stop charging for the removed seat
          try {
            await syncSubscriptionQuantity(organization.id);
            console.log(
              `Synced subscription quantity for org ${organization.id} after removing member`,
            );
          } catch (error) {
            console.error("Error syncing subscription quantity after removing member:", error);
          }
        },

        // After accepting an invitation, create credits and sync subscription quantity
        afterAcceptInvitation: async ({ member, organization }) => {
          const userId = member.userId;
          if (!userId) {
            console.warn("Cannot create credits for member without userId");
            return;
          }

          // Create credit record for the new member
          try {
            await createMemberCredits(userId, organization.id);
            console.log(
              `Created credit record for invited member ${userId} in org ${organization.id}`,
            );
          } catch (error) {
            console.error("Error creating member credits after invitation acceptance:", error);
          }

          // Sync subscription quantity to charge for the new seat
          try {
            await syncSubscriptionQuantity(organization.id);
            console.log(
              `Synced subscription quantity for org ${organization.id} after invitation acceptance`,
            );
          } catch (error) {
            console.error(
              "Error syncing subscription quantity after invitation acceptance:",
              error,
            );
          }
        },
      },
    }),
    customSession(async ({ user, session }) => {
      const members = await db
        .select({
          organizationId: schema.membersTable.organizationId,
          role: schema.membersTable.role,
          organization: schema.organizationsTable,
        })
        .from(schema.membersTable)
        .innerJoin(
          schema.organizationsTable,
          eq(schema.membersTable.organizationId, schema.organizationsTable.id),
        )
        .where(eq(schema.membersTable.userId, user.id));

      const organizations = members.map((m) => m.organization);

      const foundOrg = (session as any).activeOrganizationId
        ? organizations.find((org) => org.id === (session as any).activeOrganizationId)
        : undefined;
      const activeOrganizationSlug = foundOrg?.slug;

      // Extend the session object with organizations and user role so they're available directly on session
      return {
        user,
        session: {
          ...session,
          role: (user as any).role,
          organizations,
          activeOrganizationSlug,
        },
      };
    }),
    ...(env.BETTER_AUTH_ENABLE_TEST_UTILS ? [testUtils()] : []),
  ],
});
