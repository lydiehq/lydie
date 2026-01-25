import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import {
  db,
  documentEmbeddingsTable,
  documentTitleEmbeddingsTable,
  documentsTable,
} from "@lydie/database";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { demoContent } from "../../demo-content";
import { mutators as sharedMutators } from "../../mutators/index";
import { createOnboardingGuideContent } from "../../onboarding/guide-content";
import { MutatorContext } from "../../server-mutators";

export const createOrganizationMutation = ({ asyncTasks }: MutatorContext) =>
  defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
      metadata: z.string().optional(),
      color: z.string().optional(),
      onboardingDocId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      // Call the client mutator to create the organization (without onboarding docs)
      await sharedMutators.organization.create.fn({
        tx,
        ctx,
        args: {
          ...args,
          onboardingDocId: undefined, // Don't create onboarding docs in client mutator
        },
      });

      // If onboarding is requested, create an async task to insert onboarding documents with embeddings
      if (args.onboardingDocId) {
        asyncTasks.push(async () => {
          try {
            await createOnboardingDocumentsWithEmbeddings(
              args.id,
              args.onboardingDocId!,
              ctx.userId,
            );
          } catch (error) {
            console.error(`Failed to create onboarding documents for org ${args.id}:`, error);
            throw error;
          }
        });
      }
    },
  );

async function createOnboardingDocumentsWithEmbeddings(
  organizationId: string,
  onboardingDocId: string,
  userId: string,
) {
  // Dynamically import the pre-computed embeddings
  const { onboardingEmbeddings } = await import("../../onboarding/embeddings");

  // Create a map of demo document IDs
  const documentIdMap = new Map<string, string>();
  for (const doc of demoContent) {
    documentIdMap.set(doc.title, createId());
  }
  documentIdMap.set("Welcome to Your Workspace", onboardingDocId);

  // Create onboarding guide content
  const guideContent = createOnboardingGuideContent(documentIdMap);
  const guideYjsState = convertJsonToYjs(guideContent);
  const guideTitle = "👋 Welcome to Your Workspace!";

  const now = new Date();

  // Insert onboarding guide document
  await db.insert(documentsTable).values({
    id: onboardingDocId,
    slug: `${slugify("Welcome to Your Workspace")}-${createId().slice(0, 6)}`,
    title: guideTitle,
    yjsState: guideYjsState,
    userId: userId,
    organizationId: organizationId,
    integrationLinkId: null,
    isLocked: false,
    published: false,
    parentId: null,
    sortOrder: 0,
    customFields: {
      isOnboardingGuide: "true",
      Status: "Getting Started",
      Type: "Guide",
      Priority: "High",
    },
    createdAt: now,
    updatedAt: now,
  });

  // Insert embeddings for onboarding guide
  const guideEmbeddings = onboardingEmbeddings[guideTitle];
  if (guideEmbeddings) {
    // Insert title embedding
    await db.insert(documentTitleEmbeddingsTable).values({
      id: createId(),
      documentId: onboardingDocId,
      title: guideTitle,
      embedding: guideEmbeddings.titleEmbedding,
      createdAt: now,
      updatedAt: now,
    });

    // Insert content embeddings
    if (guideEmbeddings.contentEmbeddings.length > 0) {
      await db.insert(documentEmbeddingsTable).values(
        guideEmbeddings.contentEmbeddings.map((embedding) => ({
          id: createId(),
          documentId: onboardingDocId,
          content: embedding.content,
          embedding: embedding.embedding,
          chunkIndex: embedding.chunkIndex,
          heading: embedding.heading,
          headingLevel: embedding.headingLevel,
          headerBreadcrumb: embedding.headerBreadcrumb,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  // Create demo documents as children of the onboarding guide
  for (let i = 0; i < demoContent.length; i++) {
    const doc = demoContent[i];
    if (!doc) continue;

    const docId = documentIdMap.get(doc.title)!;
    const yjsState = convertJsonToYjs(doc.content);

    // Insert document
    await db.insert(documentsTable).values({
      id: docId,
      slug: `${slugify(doc.title)}-${createId().slice(0, 6)}`,
      title: doc.title,
      yjsState: yjsState,
      userId: userId,
      organizationId: organizationId,
      integrationLinkId: null,
      isLocked: false,
      published: false,
      parentId: onboardingDocId,
      sortOrder: i,
      customFields: { isOnboarding: "true" },
      createdAt: now,
      updatedAt: now,
    });

    // Insert embeddings for demo document
    const docEmbeddings = onboardingEmbeddings[doc.title];
    if (docEmbeddings) {
      // Insert title embedding
      await db.insert(documentTitleEmbeddingsTable).values({
        id: createId(),
        documentId: docId,
        title: doc.title,
        embedding: docEmbeddings.titleEmbedding,
        createdAt: now,
        updatedAt: now,
      });

      // Insert content embeddings
      if (docEmbeddings.contentEmbeddings.length > 0) {
        await db.insert(documentEmbeddingsTable).values(
          docEmbeddings.contentEmbeddings.map((embedding) => ({
            id: createId(),
            documentId: docId,
            content: embedding.content,
            embedding: embedding.embedding,
            chunkIndex: embedding.chunkIndex,
            heading: embedding.heading,
            headingLevel: embedding.headingLevel,
            headerBreadcrumb: embedding.headerBreadcrumb,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }
  }
}
