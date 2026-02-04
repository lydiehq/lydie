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
  processPendingSeatMembers,
  syncBillingFromCustomerState,
  syncMembersFromSeats,
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
              persistDocumentTreeExpansion: true,
            });
          }

          // Process any pending seat memberships for this user
          // This handles users who claimed a seat before signing up
          if (user.email) {
            try {
              await processPendingSeatMembers(user.id, user.email);
            } catch (error) {
              console.error("Error processing pending seat members for new user:", error);
              // Don't throw - we don't want to block user creation
            }
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
      // NOTE: We don't use Better-Auth's invitation system.
      // Invitations are handled by Polar's seat-based pricing:
      // 1. When you want to invite someone, assign them a seat via Polar
      // 2. Polar sends the invitation email
      // 3. When they claim the seat, we add them as a member via webhook
      sendInvitationEmail: async () => {
        // No-op: Polar handles invitations via seat assignments
        // This is called when using authClient.organization.inviteMember
        // but we should use seat assignment instead
        console.warn(
          "Better-Auth inviteMember called - use Polar seat assignment instead"
        );
      },

      // Enforce seat-based access control
      organizationHooks: {
        // Before adding a member, check if they have a claimed seat
        beforeAddMember: async ({ member, organization }) => {
          // Validate that we have a userId
          const userId = member.userId;
          if (!userId) {
            throw new Error("Cannot add member without a user ID");
          }

          // Check if this user already has a claimed seat in this org
          const existingSeat = await db
            .select()
            .from(schema.seatsTable)
            .where(
              eq(schema.seatsTable.claimedByUserId, userId)
            )
            .limit(1);

          if (existingSeat.length === 0) {
            // User doesn't have a claimed seat - check if there's a pending seat for their email
            const user = await db
              .select({ email: schema.usersTable.email })
              .from(schema.usersTable)
              .where(eq(schema.usersTable.id, userId))
              .limit(1);

            if (user[0]?.email) {
              const pendingSeat = await db
                .select()
                .from(schema.seatsTable)
                .where(
                  eq(schema.seatsTable.assignedEmail, user[0].email)
                )
                .limit(1);

              const seatToClaim = pendingSeat[0];
              if (seatToClaim) {
                // There's a pending seat - auto-claim it for this user
                await db
                  .update(schema.seatsTable)
                  .set({
                    status: "claimed",
                    claimedByUserId: userId,
                    claimedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.seatsTable.id, seatToClaim.id));

                console.log(
                  `Auto-claimed pending seat for user ${userId} in org ${organization.id}`
                );
                return;
              }
            }

            // No seat available - block the member addition
            throw new Error(
              "No available seat for this user. Please assign a seat in Polar first."
            );
          }
        },

        // After removing a member, revoke their seat
        afterRemoveMember: async ({ member, organization }) => {
          const userId = member.userId;
          if (!userId) {
            console.warn("Cannot revoke seats for member without userId");
            return;
          }

          // Find and revoke any claimed seats for this user
          const seats = await db
            .select()
            .from(schema.seatsTable)
            .where(
              eq(schema.seatsTable.claimedByUserId, userId)
            );

          for (const seat of seats) {
            // Revoke the seat in Polar
            try {
              const customerSeats = (polarClient as any).customerSeats;
              if (customerSeats) {
                await customerSeats.revokeSeat({
                  seatId: seat.polarSeatId,
                });

                // Update local seat record
                await db
                  .update(schema.seatsTable)
                  .set({
                    status: "revoked",
                    revokedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.seatsTable.id, seat.id));

                console.log(
                  `Revoked seat ${seat.id} for removed member ${userId}`
                );
              }
            } catch (error) {
              console.error("Error revoking seat after member removal:", error);
            }
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
            await syncBillingFromCustomerState(payload as any);

            // Sync members from seats after billing sync
            const data = (payload as any).data;
            const subscriptions =
              data?.activeSubscriptions ||
              data?.subscriptions ||
              [];
            for (const subscription of subscriptions) {
              const organizationId = subscription.metadata?.referenceId;
              if (organizationId && typeof organizationId === "string") {
                await syncMembersFromSeats(organizationId, subscription.id);
              }
            }
          },
          // Benefit grant created - sync credits when seat is claimed
          onBenefitGrantCreated: async (payload) => {
            console.log("Benefit grant created:", payload);
            await handleBenefitGrantCreated(payload as any);

            // Sync members from seats after benefit grant (seat claimed)
            const subscriptionId = (payload as any).data?.subscriptionId;
            if (subscriptionId) {
              const seat = await db
                .select({ organizationId: schema.seatsTable.organizationId })
                .from(schema.seatsTable)
                .where(
                  eq(schema.seatsTable.polarSubscriptionId, subscriptionId),
                )
                .limit(1);
              if (seat[0]?.organizationId) {
                await syncMembersFromSeats(seat[0].organizationId, subscriptionId);
              }
            }
          },
          // Benefit grant revoked - remove credits when seat is revoked
          onBenefitGrantRevoked: async (payload) => {
            console.log("Benefit grant revoked:", payload);
            await handleBenefitGrantRevoked(payload as any);
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
