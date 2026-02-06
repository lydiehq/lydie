import { db, schema } from "@lydie/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, customSession, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

import { createMemberCredits } from "./billing/workspace-credits";
import { syncSubscriptionQuantity } from "./billing/seat-management";
import { sendEmail } from "./email";
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
  baseURL:
    Resource.App.stage === "production"
      ? "https://api.lydie.co/internal/public/auth"
      : "http://localhost:3001/internal/public/auth",
  secret: Resource.BetterAuthSecret.value,
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
    google: {
      clientId: Resource.GoogleClientId.value,
      clientSecret: Resource.GoogleClientSecret.value,
    },
  },
  trustedOrigins:
    Resource.App.stage === "production"
      ? ["https://lydie.co", "https://api.lydie.co", "https://app.lydie.co"]
      : ["http://localhost:3001", "http://localhost:3000"],
  advanced: {
    defaultCookieAttributes: {
      ...(Resource.App.stage === "production"
        ? {}
        : {
            sameSite: "none",
          }),
      partitioned: true,
      secure: true,
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: Resource.App.stage === "production" ? ".lydie.co" : ".localhost",
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
            console.log(`Synced subscription quantity for org ${organization.id} after adding member`);
          } catch (error) {
            console.error("Error syncing subscription quantity after adding member:", error);
          }
        },

        // After removing a member, sync billing and clean up their credits
        afterRemoveMember: async ({ member, organization }) => {
          const userId = member.userId;
          if (!userId) {
            console.warn("Cannot remove credits for member without userId");
            return;
          }

          // Credits are kept but won't be accessible since they're no longer a member
          console.log(
            `Member ${userId} removed from org ${organization.id} - credits preserved but inaccessible`,
          );

          // Sync subscription quantity to stop charging for the removed seat
          try {
            await syncSubscriptionQuantity(organization.id);
            console.log(`Synced subscription quantity for org ${organization.id} after removing member`);
          } catch (error) {
            console.error("Error syncing subscription quantity after removing member:", error);
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
  ],
});
