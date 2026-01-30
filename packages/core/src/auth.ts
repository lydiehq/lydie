import { db, schema } from "@lydie/database";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, customSession, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

import {
  handleBenefitGrantCreated,
  handleBenefitGrantRevoked,
  polarClient,
  syncBillingFromCustomerState,
  syncSeatsFromPolar,
} from "./billing";
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
      secure: Resource.App.stage !== "production",
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
              persistDocumentTreeExpansion: true,
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
      sendInvitationEmail: async (data) => {
        const frontendUrl =
          process.env.FRONTEND_URL ||
          (Resource.App.stage === "production" ? "https://app.lydie.co" : "http://localhost:3000");
        const invitationUrl = `${frontendUrl}/invitations/${data.invitation.id}`;

        await sendEmail({
          to: data.email,
          subject: `You've been invited to join ${data.organization.name}`,
          html: `
            <p>You've been invited to join <strong>${data.organization.name}</strong> on Lydie.</p>
            <p>Click the link below to accept the invitation:</p>
            <p><a href="${invitationUrl}">${invitationUrl}</a></p>
            <p>This invitation will expire in 48 hours.</p>
          `,
        });
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
    polar({
      client: polarClient,
      createCustomerOnSignUp: false, // We create customers at organization creation time, not user signup
      use: [
        checkout({
          products: [
            {
              productId: Resource.PolarProductIdMonthly.value,
              slug: "monthly",
            },
            {
              productId: Resource.PolarProductIdYearly.value,
              slug: "yearly",
            },
          ],
          successUrl: "/",
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          secret: Resource.PolarWebhookSecret.value,
          // Use customer.state_changed for all billing sync
          // This webhook fires when: subscriptions change, benefits granted/revoked, meters updated
          onCustomerStateChanged: async (payload) => {
            console.log("Customer state changed:", payload);
            await syncBillingFromCustomerState(payload);
          },
          // Benefit grant created - sync credits when seat is claimed
          onBenefitGrantCreated: async (payload) => {
            console.log("Benefit grant created:", payload);
            await handleBenefitGrantCreated(payload);
          },
          // Benefit grant revoked - remove credits when seat is revoked
          onBenefitGrantRevoked: async (payload) => {
            console.log("Benefit grant revoked:", payload);
            await handleBenefitGrantRevoked(payload);
          },
          // Keep order.created for one-time purchases (not covered by customer.state_changed)
          onOrderCreated: async (payload) => {
            console.log("Order created (one-time purchase):", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in order metadata");
              return;
            }

            // Sync seats for one-time purchase
            try {
              await syncSeatsFromPolar(organizationId, {
                orderId: payload.data.id,
              });
            } catch (error) {
              console.error("Error syncing seats on order created:", error);
            }
          },
        }),
      ],
    }),
  ],
});
