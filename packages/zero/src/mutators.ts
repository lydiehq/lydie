import { defineMutators, defineMutator } from "@rocicorp/zero";
import { createId } from "@lydie/core/id";
import { z } from "zod";
import { isAuthenticated, hasOrganizationAccess } from "./auth";
import { zql } from "./schema";

export const mutators = defineMutators({
  folder: {
    create: defineMutator(
      z.object({
        id: z.string(),
        name: z.string(),
        organizationId: z.string(),
        parentId: z.string().optional(),
      }),
      async ({ tx, ctx, args: { id, name, organizationId, parentId } }) => {
        hasOrganizationAccess(ctx, organizationId);

        await tx.mutate.folders.insert({
          id,
          name,
          parent_id: parentId || null,
          user_id: ctx.userId,
          organization_id: organizationId,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
    rename: defineMutator(
      z.object({
        folderId: z.string(),
        name: z.string(),
      }),
      async ({ tx, args: { folderId, name } }) => {
        await tx.mutate.folders.update({
          id: folderId,
          name,
          updated_at: Date.now(),
        });
      }
    ),
    move: defineMutator(
      z.object({
        folderId: z.string(),
        newParentId: z.string().optional(),
      }),
      async ({ tx, args: { folderId, newParentId } }) => {
        await tx.mutate.folders.update({
          id: folderId,
          parent_id: newParentId || null,
          updated_at: Date.now(),
        });
      }
    ),
    delete: defineMutator(
      z.object({
        folderId: z.string(),
      }),
      async ({ tx, ctx, args: { folderId } }) => {
        isAuthenticated(ctx);

        // Helper function for recursive folder soft deletion
        const softDeleteFolderRecursive = async (folderId: string) => {
          // Recursively soft-delete all child folders
          const childFolders = await tx.run(
            zql.folders
              .where("parent_id", folderId)
              .where("deleted_at", "IS", null)
          );

          for (const childFolder of childFolders) {
            // Recursively soft-delete each child folder (which will handle their children)
            await softDeleteFolderRecursive(childFolder.id);
          }

          // Soft-delete all documents in this folder
          const documents = await tx.run(
            zql.documents
              .where("folder_id", folderId)
              .where("deleted_at", "IS", null)
          );

          for (const document of documents) {
            await tx.mutate.documents.update({
              id: document.id,
              deleted_at: Date.now(),
              updated_at: Date.now(),
            });
          }

          // Finally, soft-delete the folder itself
          await tx.mutate.folders.update({
            id: folderId,
            deleted_at: Date.now(),
            updated_at: Date.now(),
          });
        };

        // Soft-delete the folder and all its children recursively
        await softDeleteFolderRecursive(folderId);
      }
    ),
  },
  document: {
    publish: defineMutator(
      z.object({
        documentId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId);
        const document = await tx.run(
          zql.documents
            .where("id", documentId)
            .where("organization_id", organizationId)
            .one()
        );

        if (!document) {
          throw new Error(`Document not found: ${documentId}`);
        }

        await tx.mutate.documents.update({
          id: documentId,
          published: true,
        });

        await tx.mutate.document_publications.insert({
          id: createId(),
          document_id: documentId,
          organization_id: organizationId,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
    create: defineMutator(
      z.object({
        id: z.string(),
        organizationId: z.string(),
        title: z.string().optional(),
        folderId: z.string().optional(),
        jsonContent: z.any().optional(),
      }),
      async ({
        tx,
        ctx,
        args: { id, organizationId, title = "", folderId, jsonContent },
      }) => {
        hasOrganizationAccess(ctx, organizationId);

        await tx.mutate.documents.insert({
          id,
          slug: id,
          title,
          json_content: jsonContent || { type: "doc", content: [] },
          user_id: ctx.userId,
          organization_id: organizationId,
          index_status: "pending",
          published: false,
          folder_id: folderId || null,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
    update: defineMutator(
      z.object({
        documentId: z.string(),
        title: z.string().optional(),
        jsonContent: z.any().optional(),
        published: z.boolean().optional(),
        slug: z.string().optional(),
        indexStatus: z.string().optional(),
        organizationId: z.string(),
      }),
      async ({
        tx,
        ctx,
        args: {
          documentId,
          title,
          jsonContent,
          published,
          slug,
          indexStatus,
          organizationId,
        },
      }) => {
        hasOrganizationAccess(ctx, organizationId);
        const updates: any = {
          id: documentId,
          updated_at: Date.now(),
        };

        if (title !== undefined) updates.title = title;
        if (jsonContent !== undefined) updates.json_content = jsonContent;
        if (published !== undefined) updates.published = published;
        if (slug !== undefined) updates.slug = slug;
        if (indexStatus !== undefined) updates.index_status = indexStatus;

        await tx.mutate.documents.update(updates);
      }
    ),
    rename: defineMutator(
      z.object({
        documentId: z.string(),
        title: z.string(),
      }),
      async ({ tx, args: { documentId, title } }) => {
        await tx.mutate.documents.update({
          id: documentId,
          title,
          updated_at: Date.now(),
        });
      }
    ),
    moveToFolder: defineMutator(
      z.object({
        documentId: z.string(),
        folderId: z.string().optional(),
      }),
      async ({ tx, args: { documentId, folderId } }) => {
        await tx.mutate.documents.update({
          id: documentId,
          folder_id: folderId || null,
          updated_at: Date.now(),
        });
      }
    ),
    delete: defineMutator(
      z.object({
        documentId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId } }) => {
        isAuthenticated(ctx);

        // Soft-delete by setting deleted_at
        await tx.mutate.documents.update({
          id: documentId,
          deleted_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
  },
  documentComponent: {
    create: defineMutator(
      z.object({
        id: z.string(),
        name: z.string(),
        properties: z.any(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { id, name, properties, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId);

        await tx.mutate.document_components.insert({
          id,
          name,
          properties,
          organization_id: organizationId,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
  },
  assistantConversation: {
    delete: defineMutator(
      z.object({
        conversationId: z.string(),
      }),
      async ({ tx, ctx, args: { conversationId } }) => {
        isAuthenticated(ctx);

        const conversation = await tx.run(
          zql.assistant_conversations.where("id", conversationId).one()
        );

        if (!conversation) return;

        if (conversation.user_id !== ctx.userId) {
          throw new Error("Unauthorized");
        }

        await tx.mutate.assistant_conversations.delete({
          id: conversationId,
        });

        const messages = await tx.run(
          zql.assistant_messages.where("conversation_id", conversationId)
        );

        for (const message of messages) {
          await tx.mutate.assistant_messages.delete({ id: message.id });
        }
      }
    ),
  },
  apiKey: {
    revoke: defineMutator(
      z.object({
        keyId: z.string(),
      }),
      async ({ tx, ctx, args: { keyId } }) => {
        isAuthenticated(ctx);

        await tx.mutate.api_keys.update({
          id: keyId,
          revoked: true,
          updated_at: Date.now(),
        });
      }
    ),
  },
  userSettings: {
    update: defineMutator(
      z.object({
        persistDocumentTreeExpansion: z.boolean().optional(),
        aiPromptStyle: z.string().optional(),
        customPrompt: z.string().nullable().optional(),
      }),
      async ({
        tx,
        ctx,
        args: { persistDocumentTreeExpansion, aiPromptStyle, customPrompt },
      }) => {
        isAuthenticated(ctx);

        // Get or create the user's settings
        let settings = await tx.run(
          zql.user_settings.where("user_id", ctx.userId).one()
        );

        if (!settings) {
          // Create settings if they don't exist
          const id = createId();
          await tx.mutate.user_settings.insert({
            id,
            user_id: ctx.userId,
            persist_document_tree_expansion: true,
            ai_prompt_style: "default",
            custom_prompt: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
          settings = await tx.run(zql.user_settings.where("id", id).one());
        }

        if (!settings) {
          throw new Error("User settings not found");
        }

        const updates: any = {
          id: settings.id,
          updated_at: Date.now(),
        };

        if (persistDocumentTreeExpansion !== undefined) {
          updates.persist_document_tree_expansion =
            persistDocumentTreeExpansion;
        }

        if (aiPromptStyle !== undefined) {
          updates.ai_prompt_style = aiPromptStyle;
        }

        if (customPrompt !== undefined) {
          updates.custom_prompt = customPrompt || null;
        }

        await tx.mutate.user_settings.update(updates);
      }
    ),
  },
  organizationSettings: {
    update: defineMutator(
      z.object({
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId);

        // Get or create the organization's settings
        let settings = await tx.run(
          zql.organization_settings
            .where("organization_id", organizationId)
            .one()
        );

        if (!settings) {
          // Create settings if they don't exist
          const id = createId();
          await tx.mutate.organization_settings.insert({
            id,
            organization_id: organizationId,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
          settings = await tx.run(
            zql.organization_settings.where("id", id).one()
          );
        }

        if (!settings) {
          throw new Error("Organization settings not found");
        }

        const updates: any = {
          id: settings.id,
          updated_at: Date.now(),
        };

        await tx.mutate.organization_settings.update(updates);
      }
    ),
  },
  organization: {
    create: defineMutator(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().optional(),
        metadata: z.string().optional(),
      }),
      async ({ tx, ctx, args: { id, name, slug, logo, metadata } }) => {
        isAuthenticated(ctx);

        await tx.mutate.organizations.insert({
          id,
          name,
          slug,
          logo: logo || null,
          metadata: metadata || null,
          subscription_status: "free",
          subscription_plan: "free",
          created_at: Date.now(),
          updated_at: Date.now(),
          polar_subscription_id: null,
        });

        await tx.mutate.members.insert({
          id: createId(),
          organization_id: id,
          user_id: ctx.userId,
          role: "owner",
          created_at: Date.now(),
          updated_at: Date.now(),
        });

        // Create default organization settings
        await tx.mutate.organization_settings.insert({
          id: createId(),
          organization_id: id,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
    update: defineMutator(
      z.object({
        organizationId: z.string(),
        name: z.string().optional(),
      }),
      async ({ tx, ctx, args: { organizationId, name } }) => {
        hasOrganizationAccess(ctx, organizationId);

        const updates: any = {
          id: organizationId,
          updated_at: Date.now(),
        };

        if (name !== undefined) {
          updates.name = name;
        }

        await tx.mutate.organizations.update(updates);
      }
    ),
    delete: defineMutator(
      z.object({
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId);

        // Verify user is an owner before allowing deletion
        const member = await tx.run(
          zql.members
            .where("organization_id", organizationId)
            .where("user_id", ctx.userId)
            .one()
        );

        console.log(member);

        if (!member || member.role !== "owner") {
          throw new Error(
            "Only organization owners can delete the organization"
          );
        }

        // Delete the organization - database cascades will handle related records
        await tx.mutate.organizations.delete({ id: organizationId });
      }
    ),
  },
  integration: {
    deleteLink: defineMutator(
      z.object({
        linkId: z.string(),
        deleteDocuments: z.boolean().optional(),
        organizationId: z.string(),
      }),
      async ({
        tx,
        ctx,
        args: { linkId, deleteDocuments, organizationId },
      }) => {
        hasOrganizationAccess(ctx, organizationId);
        const link = await tx.run(
          zql.integration_links
            .where("id", linkId)
            .where("organization_id", organizationId)
            .one()
            .related("documents")
        );

        if (!link) {
          throw new Error(`Link not found: ${linkId}`);
        }

        if (deleteDocuments) {
          const deleteDocumentsPromise = link.documents.map(({ id }) =>
            tx.mutate.documents.delete({ id })
          );
          await Promise.all(deleteDocumentsPromise);
        }

        await tx.mutate.integration_links.delete({ id: linkId });
      }
    ),
    createLink: defineMutator(
      z.object({
        id: z.string(),
        connectionId: z.string(),
        name: z.string(),
        config: z.record(z.string(), z.any()),
        organizationId: z.string(),
      }),
      async ({
        tx,
        ctx,
        args: { id, connectionId, name, config, organizationId },
      }) => {
        hasOrganizationAccess(ctx, organizationId);

        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one()
        );

        if (!connection) {
          throw new Error(
            `Connection not found: ${connectionId} for organization ${organizationId}`
          );
        }

        await tx.mutate.integration_links.insert({
          id,
          connection_id: connection.id,
          organization_id: organizationId,
          integration_type: connection.integration_type,
          created_at: Date.now(),
          updated_at: Date.now(),
          name,
          config,
        });
      }
    ),
  },
  integrationConnection: {
    create: defineMutator(
      z.object({
        id: z.string(),
        integrationType: z.string(),
        organizationId: z.string(),
        config: z.any(),
      }),
      async ({
        tx,
        ctx,
        args: { id, integrationType, organizationId, config },
      }) => {
        hasOrganizationAccess(ctx, organizationId);

        await tx.mutate.integration_connections.insert({
          id,
          integration_type: integrationType,
          status: "active",
          organization_id: organizationId,
          config,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    ),
    update: defineMutator(
      z.object({
        connectionId: z.string(),
        config: z.any().optional(),
      }),
      async ({ tx, args: { connectionId, config } }) => {
        const updates: any = {
          id: connectionId,
          updated_at: Date.now(),
        };

        if (config !== undefined) updates.config = config;

        await tx.mutate.integration_connections.update(updates);
      }
    ),
    disconnect: defineMutator(
      z.object({
        connectionId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { connectionId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId);
        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one()
        );

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`);
        }

        await tx.mutate.integration_connections.update({
          id: connectionId,
          updated_at: Date.now(),
        });
      }
    ),
  },
  syncMetadata: {
    upsert: defineMutator(
      z.object({
        id: z.string().optional(),
        documentId: z.string(),
        connectionId: z.string(),
        externalId: z.string(),
        lastSyncedAt: z.number().optional(),
        lastSyncedHash: z.string().optional(),
        syncStatus: z.string(),
        syncError: z.string().optional(),
      }),
      async ({
        tx,
        args: {
          id,
          documentId,
          connectionId,
          externalId,
          lastSyncedAt,
          lastSyncedHash,
          syncStatus,
          syncError,
        },
      }) => {
        // Check if metadata exists for this document-connection pair
        const existing = await tx.run(
          zql.sync_metadata
            .where("document_id", documentId)
            .where("connection_id", connectionId)
            .one()
        );

        if (existing) {
          // Update existing
          const updates: any = {
            id: existing.id,
            external_id: externalId,
            sync_status: syncStatus,
            updated_at: Date.now(),
          };

          if (lastSyncedAt !== undefined) updates.last_synced_at = lastSyncedAt;
          if (lastSyncedHash !== undefined)
            updates.last_synced_hash = lastSyncedHash;
          if (syncError !== undefined) updates.sync_error = syncError;

          await tx.mutate.sync_metadata.update(updates);
        } else {
          // Insert new
          await tx.mutate.sync_metadata.insert({
            id: id || createId(),
            document_id: documentId,
            connection_id: connectionId,
            external_id: externalId,
            last_synced_at: lastSyncedAt || null,
            last_synced_hash: lastSyncedHash || null,
            sync_status: syncStatus,
            sync_error: syncError || null,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
        }
      }
    ),
  },
});

export type Mutators = typeof mutators;
