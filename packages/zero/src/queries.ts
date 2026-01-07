import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import {
  isAuthenticated,
  hasOrganizationAccess,
  hasOrganizationAccessBySlug,
  type Context,
} from "./auth";
import { zql } from "./schema";

export type QueryContext = Context;

export const queries = defineQueries({
  documents: {
    byUpdated: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .orderBy("updated_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ organizationId: z.string(), documentId: z.string() }),
      ({ args: { organizationId, documentId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        return zql.documents
          .where("id", documentId)
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .one()
          .related("parent")
          .related("children", (q) =>
            q
              .where("deleted_at", "IS", null)
              .orderBy("sort_order", "asc")
              .orderBy("created_at", "asc")
          )
          .related("organization")
          .related("conversations", (q) =>
            q
              .related("messages", (q) => q.orderBy("created_at", "asc"))
              .orderBy("created_at", "desc")
              .limit(8)
          );
      }
    ),
    search: defineQuery(
      z.object({
        organizationId: z.string(),
        searchTerm: z.string(),
      }),
      ({ args: { organizationId, searchTerm }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        if (!searchTerm.trim()) {
          return zql.documents
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .orderBy("created_at", "desc")
            .limit(5);
        }

        return zql.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .where("title", "ILIKE", `%${searchTerm}%`)
          .orderBy("created_at", "desc")
          .limit(20);
      }
    ),
  },
  components: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.document_components
          .where("organization_id", organizationId)
          .orderBy("created_at", "desc");
      }
    ),
  },
  apiKeys: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.api_keys
          .where("organization_id", organizationId)
          .where("revoked", false)
          .orderBy("created_at", "desc");
      }
    ),
  },
  members: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.members
          .where("organization_id", organizationId)
          .related("user")
          .orderBy("created_at", "desc");
      }
    ),
  },
  invitations: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.invitations
          .where("organization_id", organizationId)
          .where("status", "pending")
          .related("inviter")
          .orderBy("created_at", "desc");
      }
    ),
    byUser: defineQuery(
      z.object({ email: z.string() }),
      ({ args: { email }, ctx }) => {
        isAuthenticated(ctx);
        return zql.invitations
          .where("status", "pending")
          .where("email", email)
          .related("organization")
          .related("inviter")
          .orderBy("created_at", "desc");
      }
    ),
  },
  organizations: {
    byUser: defineQuery(z.object({}), ({ ctx }) => {
      isAuthenticated(ctx);
      return zql.members
        .where("user_id", ctx.userId)
        .related("organization")
        .orderBy("created_at", "desc");
    }),
    byId: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.organizations.where("id", organizationId).one();
      }
    ),
    bySlug: defineQuery(
      z.object({ organizationSlug: z.string(), source: z.string().optional() }),
      ({ args: { organizationSlug, source }, ctx }) => {
        hasOrganizationAccessBySlug(ctx, organizationSlug);
        console.log("Getting organization by slug", source);
        return zql.organizations.where("slug", organizationSlug).one();
      }
    ),
    billing: defineQuery(
      z.object({ organizationSlug: z.string() }),
      ({ args: { organizationSlug }, ctx }) => {
        hasOrganizationAccessBySlug(ctx, organizationSlug);

        return zql.organizations
          .where("slug", organizationSlug)
          .one()
          .related("llmUsage", (q) => q.orderBy("created_at", "desc"));
      }
    ),
    documents: defineQuery(
      z.object({ organizationSlug: z.string() }),
      ({ args: { organizationSlug }, ctx }) => {
        hasOrganizationAccessBySlug(ctx, organizationSlug);
        console.log("Preloading documents for organization", organizationSlug);
        return zql.organizations
          .where("slug", organizationSlug)
          .one()
          .related("documents", (q) =>
            q
              .where("deleted_at", "IS", null)
              .orderBy("sort_order", "asc")
              .orderBy("created_at", "desc")
          );
      }
    ),
    searchDocuments: defineQuery(
      z.object({
        organizationId: z.string(),
        searchTerm: z.string(),
      }),
      ({ args: { organizationId, searchTerm }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        const searchPattern = searchTerm.trim()
          ? `%${searchTerm.trim()}%`
          : "%";

        // If search term is empty, return all items (limited)
        // Exclude deleted items
        if (!searchTerm.trim()) {
          return zql.organizations
            .where("id", organizationId)
            .one()
            .related("documents", (q) =>
              q
                .where("deleted_at", "IS", null)
                .orderBy("created_at", "desc")
                .limit(20)
            );
        }

        // Search documents by title
        // Exclude deleted items
        return zql.organizations
          .where("id", organizationId)
          .one()
          .related("documents", (q) =>
            q
              .where("deleted_at", "IS", null)
              .where("title", "ILIKE", searchPattern)
              .orderBy("updated_at", "desc")
              .limit(20)
          );
      }
    ),
  },
  assistant: {
    conversations: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.assistant_conversations
          .where("organization_id", organizationId)
          .where("user_id", ctx.userId)
          .related("messages", (q) => q.orderBy("created_at", "asc"))
          .orderBy("created_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ organizationId: z.string(), conversationId: z.string() }),
      ({ args: { organizationId, conversationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return (
          zql.assistant_conversations
            .where("id", conversationId)
            // .where("organization_id", organizationId)
            .where("user_id", ctx.userId)
            .one()
            .related("messages", (q) => q.orderBy("created_at", "asc"))
        );
      }
    ),
  },
  usage: {
    today: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        // Get start of today in Unix timestamp (milliseconds)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDay = today.getTime();

        return zql.llm_usage
          .where("organization_id", organizationId)
          .where("created_at", ">=", startOfDay)
          .orderBy("created_at", "desc");
      }
    ),
  },
  settings: {
    user: defineQuery(z.object({}), ({ ctx }) => {
      isAuthenticated(ctx);
      const settings = zql.user_settings.where("user_id", ctx.userId).one();
      return settings;
    }),
    organization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.organization_settings
          .where("organization_id", organizationId)
          .one();
      }
    ),
  },
  integrations: {
    byIntegrationType: defineQuery(
      z.object({ integrationType: z.string(), organizationId: z.string() }),
      ({ args: { integrationType, organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_connections
          .where("integration_type", integrationType)
          .where("organization_id", organizationId)
          .orderBy("created_at", "desc");
      }
    ),
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        console.log(
          "Getting integration connections for organization",
          organizationId
        );
        return zql.integration_connections
          .where("organization_id", organizationId)
          .related("links", (links) => links)
          .orderBy("created_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ connectionId: z.string(), organizationId: z.string() }),
      ({ args: { connectionId, organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_connections
          .where("id", connectionId)
          .where("organization_id", organizationId)
          .related("links")
          .one();
      }
    ),
  },
  integrationLinks: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_links
          .where("organization_id", organizationId)
          .related("connection")
          .orderBy("created_at", "desc");
      }
    ),
    byConnection: defineQuery(
      z.object({ connectionId: z.string(), organizationId: z.string() }),
      ({ args: { connectionId, organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_links
          .where("connection_id", connectionId)
          .where("organization_id", organizationId)
          .related("connection")
          .orderBy("created_at", "desc");
      }
    ),
    byIntegrationType: defineQuery(
      z.object({ organizationId: z.string(), integrationType: z.string() }),
      ({ args: { organizationId, integrationType }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_links
          .where("organization_id", organizationId)
          .where("integration_type", integrationType)
          .related("connection")
          .related("documents", (q) => q.orderBy("created_at", "desc"))
          .orderBy("created_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ linkId: z.string(), organizationId: z.string() }),
      ({ args: { linkId, organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_links
          .where("id", linkId)
          .where("organization_id", organizationId)
          .related("connection")
          .one();
      }
    ),
  },
  syncMetadata: {
    byDocument: defineQuery(
      z.object({ documentId: z.string(), organizationId: z.string() }),
      ({ args: { documentId, organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.sync_metadata
          .where("document_id", documentId)
          .related("connection", (q) =>
            q.where("organization_id", organizationId)
          )
          .orderBy("created_at", "desc");
      }
    ),
  },
  integrationActivityLogs: {
    byIntegrationType: defineQuery(
      z.object({ organizationId: z.string(), integrationType: z.string() }),
      ({ args: { organizationId, integrationType }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return zql.integration_activity_logs
          .where("integration_type", integrationType)
          .related("connection", (q) =>
            q.where("organization_id", organizationId)
          )
          .orderBy("created_at", "desc");
      }
    ),
  },
});
