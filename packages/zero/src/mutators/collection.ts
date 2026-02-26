import { resolveRelationTargetCollectionId } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { defineMutator } from "@rocicorp/zero";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { withTimestamps } from "../utils/timestamps";

const RESERVED_HANDLES = new Set([
  "api",
  "v1",
  "settings",
  "admin",
  "auth",
  "public",
  "static",
  "assets",
  "collections",
  "documents",
  "users",
  "organizations",
  "webhooks",
  "integrations",
]);

const propertyDefinitionSchema = z.object({
  name: z.string(),
  type: z.enum([
    "text",
    "number",
    "date",
    "select",
    "multi-select",
    "status",
    "boolean",
    "relation",
  ]),
  required: z.boolean(),
  unique: z.boolean(),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().min(1),
        color: z.string().optional(),
        order: z.number(),
        archived: z.boolean().optional(),
        stage: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETE"]).optional(),
      }),
    )
    .optional(),
  relation: z
    .object({
      targetCollectionId: z.union([z.literal("self"), z.string()]),
      many: z.boolean().optional(),
    })
    .optional(),
  derived: z
    .object({
      sourceField: z.string(),
      transform: z.enum(["slugify"]),
      editable: z.boolean(),
      warnOnChangeAfterPublish: z.boolean().optional(),
    })
    .optional(),
});

const propertiesSchema = z.array(propertyDefinitionSchema);

const collectionViewTypeSchema = z.enum(["table", "list", "kanban"]);

function validatePropertyDefinitions(properties: Array<z.infer<typeof propertyDefinitionSchema>>) {
  for (const property of properties) {
    const isEnumField =
      property.type === "select" || property.type === "multi-select" || property.type === "status";
    if (!isEnumField) {
      continue;
    }

    if (!property.options || property.options.length === 0) {
      throw new Error(`Property "${property.name}" must define at least one option`);
    }

    const seenOptionIds = new Set<string>();
    for (const option of property.options) {
      if (seenOptionIds.has(option.id)) {
        throw new Error(`Property "${property.name}" has duplicate option id "${option.id}"`);
      }
      seenOptionIds.add(option.id);

      if (property.type === "status" && !option.stage) {
        throw new Error(
          `Status property "${property.name}" option "${option.label}" is missing stage`,
        );
      }
    }
  }
}

async function validateEnumFieldValues(
  collectionProperties: unknown,
  values: Record<string, string | number | boolean | string[] | null>,
) {
  const properties = Array.isArray(collectionProperties)
    ? (collectionProperties as Array<Record<string, unknown>>)
    : [];

  for (const property of properties) {
    if (typeof property.name !== "string" || typeof property.type !== "string") {
      continue;
    }

    if (!(property.name in values)) {
      continue;
    }

    const isEnumField =
      property.type === "select" || property.type === "multi-select" || property.type === "status";
    if (!isEnumField) {
      continue;
    }

    const rawOptions = Array.isArray(property.options) ? property.options : [];
    const optionIds = new Set(
      rawOptions
        .filter((option): option is { id: string } => {
          return (
            typeof option === "object" &&
            option !== null &&
            typeof (option as { id?: unknown }).id === "string"
          );
        })
        .map((option) => option.id),
    );

    const rawValue = values[property.name];
    if (property.type === "multi-select") {
      if (rawValue === null) {
        continue;
      }

      if (typeof rawValue === "string") {
        if (!optionIds.has(rawValue)) {
          throw new Error(`Invalid option id "${rawValue}" for field "${property.name}"`);
        }
        continue;
      }

      if (!Array.isArray(rawValue) || rawValue.some((entry) => typeof entry !== "string")) {
        throw new Error(
          `Multi-select field "${property.name}" must be a list of option ids or null`,
        );
      }

      for (const optionId of rawValue) {
        if (!optionIds.has(optionId)) {
          throw new Error(`Invalid option id "${optionId}" for field "${property.name}"`);
        }
      }

      continue;
    }

    if (rawValue === null) {
      continue;
    }

    if (typeof rawValue !== "string") {
      throw new Error(`Field "${property.name}" must be an option id or null`);
    }

    if (!optionIds.has(rawValue)) {
      throw new Error(`Invalid option id "${rawValue}" for field "${property.name}"`);
    }
  }
}

async function maybeOne<T>(query: Promise<T>): Promise<T | null> {
  try {
    return await query;
  } catch {
    return null;
  }
}

async function getCollectionViewById(tx: any, organizationId: string, viewId: string) {
  return maybeOne<{
    id: string;
    organization_id: string;
    collection_id: string;
    config?: Record<string, unknown>;
    deleted_at: number | null;
  }>(
    tx.run(
      zql.collection_views
        .where("id", viewId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one(),
    ),
  );
}

async function createUniqueHandle(tx: any, organizationId: string, input: string): Promise<string> {
  const base = slugify(input).trim() || `collection-${createId().slice(0, 4)}`;
  if (RESERVED_HANDLES.has(base)) {
    throw new Error("This handle is reserved.");
  }

  let handle = base;
  let counter = 2;
  while (true) {
    const existing = await tx.run(
      zql.collections.where("organization_id", organizationId).where("handle", handle).one(),
    );

    if (!existing) {
      return handle;
    }

    handle = `${base}-${counter}`;
    counter += 1;
  }
}

async function validateHandleForUpdate(
  tx: any,
  organizationId: string,
  collectionId: string,
  input: string,
): Promise<string> {
  const handle = slugify(input).trim();

  if (!handle) {
    throw new Error("Handle is required.");
  }

  if (RESERVED_HANDLES.has(handle)) {
    throw new Error("This handle is reserved.");
  }

  const existing = (await maybeOne(
    tx.run(zql.collections.where("organization_id", organizationId).where("handle", handle).one()),
  )) as { id: string } | null;

  if (existing && existing.id !== collectionId) {
    throw new Error("Handle is already in use.");
  }

  return handle;
}

async function validateRelationFieldValues(
  tx: any,
  organizationId: string,
  collectionId: string,
  documentId: string,
  collectionProperties: unknown,
  values: Record<string, string | number | boolean | string[] | null>,
) {
  const properties = Array.isArray(collectionProperties)
    ? (collectionProperties as Array<Record<string, unknown>>)
    : [];

  const relationProperties = properties.filter(
    (property) => property.type === "relation" && typeof property.name === "string",
  );

  for (const property of relationProperties) {
    const propertyName = property.name as string;
    if (!(propertyName in values)) {
      continue;
    }

    const relationConfig =
      typeof property.relation === "object" && property.relation !== null
        ? (property.relation as { targetCollectionId?: unknown; many?: unknown })
        : null;
    const isMany = relationConfig?.many === true;

    const rawValue = values[propertyName];

    const normalizedRelationIds = (() => {
      if (isMany) {
        if (rawValue === null) {
          return [];
        }

        if (typeof rawValue === "string") {
          return [rawValue];
        }

        if (!Array.isArray(rawValue) || rawValue.some((entry) => typeof entry !== "string")) {
          throw new Error(`Relation field "${propertyName}" must be a list of document ids`);
        }

        return Array.from(new Set(rawValue));
      }

      if (rawValue === null) {
        return [];
      }

      if (typeof rawValue === "string") {
        return [rawValue];
      }

      if (Array.isArray(rawValue) && rawValue.every((entry) => typeof entry === "string")) {
        if (rawValue.length === 0) {
          return [];
        }

        if (rawValue.length > 1) {
          throw new Error(`Relation field "${propertyName}" must be a document id or null`);
        }

        const firstRelationId = rawValue[0];
        if (!firstRelationId) {
          return [];
        }

        return [firstRelationId];
      }

      throw new Error(`Relation field "${propertyName}" must be a document id or null`);
    })();

    const normalizedSingleRelationId = normalizedRelationIds[0] ?? null;
    values[propertyName] = isMany ? normalizedRelationIds : normalizedSingleRelationId;

    if (normalizedRelationIds.length === 0) {
      continue;
    }

    for (const relationId of normalizedRelationIds) {
      if (relationId === documentId) {
        throw new Error(`Relation field "${propertyName}" cannot reference the same document`);
      }
    }

    const targetCollectionId = resolveRelationTargetCollectionId(
      typeof relationConfig?.targetCollectionId === "string"
        ? { targetCollectionId: relationConfig.targetCollectionId }
        : undefined,
      collectionId,
    );

    for (const relationId of normalizedRelationIds) {
      const targetDocument = (await maybeOne(
        tx.run(
          zql.documents
            .where("id", relationId)
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .one(),
        ),
      )) as { collection_id?: string | null } | null;

      if (!targetDocument) {
        throw new Error(`Referenced document for "${propertyName}" was not found`);
      }

      if (targetDocument.collection_id !== targetCollectionId) {
        throw new Error(
          `Referenced document for "${propertyName}" is not in the target collection`,
        );
      }
    }
  }
}

function getRelationManyByFieldName(
  properties: unknown,
): Map<string, { isMany: boolean; targetCollectionId: string | null }> {
  const relationMap = new Map<string, { isMany: boolean; targetCollectionId: string | null }>();

  const schemaProperties = Array.isArray(properties)
    ? (properties as Array<Record<string, unknown>>)
    : [];

  for (const property of schemaProperties) {
    if (property.type !== "relation" || typeof property.name !== "string") {
      continue;
    }

    const relation =
      typeof property.relation === "object" && property.relation !== null
        ? (property.relation as { many?: unknown; targetCollectionId?: unknown })
        : null;

    relationMap.set(property.name, {
      isMany: relation?.many === true,
      targetCollectionId:
        typeof relation?.targetCollectionId === "string" ? relation.targetCollectionId : null,
    });
  }

  return relationMap;
}

function normalizeValueForManyRelation(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
}

async function migrateSingleToManyRelationValues(
  tx: any,
  collectionId: string,
  previousProperties: unknown,
  nextProperties: unknown,
) {
  const previousRelationMap = getRelationManyByFieldName(previousProperties);
  const nextRelationMap = getRelationManyByFieldName(nextProperties);

  const fieldsToMigrate = Array.from(nextRelationMap.entries())
    .filter(([fieldName, nextConfig]) => {
      const previous = previousRelationMap.get(fieldName);
      return previous?.isMany === false && nextConfig.isMany === true;
    })
    .map(([fieldName]) => fieldName);

  if (fieldsToMigrate.length === 0) {
    return;
  }

  const existingFieldRows = await tx.run(zql.collection_fields.where("collection_id", collectionId));

  for (const row of existingFieldRows) {
    const existingValues =
      typeof row.values === "object" && row.values !== null
        ? ({ ...(row.values as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    let didChange = false;
    for (const fieldName of fieldsToMigrate) {
      if (!(fieldName in existingValues)) {
        continue;
      }

      const normalized = normalizeValueForManyRelation(existingValues[fieldName]);
      const current = existingValues[fieldName];
      const isSameArray =
        Array.isArray(current) &&
        current.length === normalized.length &&
        current.every((entry, index) => entry === normalized[index]);

      if (isSameArray) {
        continue;
      }

      existingValues[fieldName] = normalized;
      didChange = true;
    }

    if (!didChange) {
      continue;
    }

    await tx.mutate.collection_fields.update({
      id: row.id,
      values: existingValues as ReadonlyJSONValue,
    });
  }
}

export const collectionMutators = {
  create: defineMutator(
    z.object({
      collectionId: z.string().optional(),
      defaultViewId: z.string().optional(),
      organizationId: z.string(),
      name: z.string().min(1),
      handle: z.string().optional(),
      properties: propertiesSchema.default([]),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const handle = await createUniqueHandle(
        tx,
        args.organizationId,
        args.handle?.trim() || args.name,
      );

      validatePropertyDefinitions(args.properties);

      const collectionId = args.collectionId ?? createId();

      await tx.mutate.collections.insert(
        withTimestamps({
          id: collectionId,
          organization_id: args.organizationId,
          name: args.name.trim(),
          handle,
          properties: args.properties as ReadonlyJSONValue,
        }),
      );

      await tx.mutate.collection_views.insert(
        withTimestamps({
          id: args.defaultViewId ?? createId(),
          organization_id: args.organizationId,
          collection_id: collectionId,
          name: "Table",
          type: "table",
          config: {
            filters: {},
            sortField: null,
            sortDirection: "asc",
            groupBy: null,
          } as ReadonlyJSONValue,
          deleted_at: null,
        }),
      );
    },
  ),

  update: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      name: z.string().optional(),
      handle: z.string().optional(),
      properties: propertiesSchema.optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await tx.run(
        zql.collections
          .where("id", args.collectionId)
          .where("organization_id", args.organizationId)
          .one(),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      const updates: any = { id: args.collectionId };

      if (args.name !== undefined) {
        updates.name = args.name.trim();
      }
      if (args.handle !== undefined) {
        updates.handle = await validateHandleForUpdate(
          tx,
          args.organizationId,
          args.collectionId,
          args.handle,
        );
      }
      if (args.properties !== undefined) {
        validatePropertyDefinitions(args.properties);
        await migrateSingleToManyRelationValues(
          tx,
          args.collectionId,
          existing.properties,
          args.properties,
        );
        updates.properties = args.properties as ReadonlyJSONValue;
      }

      await tx.mutate.collections.update(updates);
    },
  ),

  updateFieldValues: defineMutator(
    z.object({
      documentId: z.string(),
      collectionId: z.string(),
      organizationId: z.string(),
      values: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
      ),
    }),
    async ({ tx, ctx, args: { documentId, collectionId, organizationId, values } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const [document, collection] = await Promise.all([
        maybeOne(
          tx.run(
            zql.documents
              .where("id", documentId)
              .where("organization_id", organizationId)
              .where("deleted_at", "IS", null)
              .one(),
          ),
        ),
        maybeOne(
          tx.run(
            zql.collections
              .where("id", collectionId)
              .where("organization_id", organizationId)
              .one(),
          ),
        ),
      ]);

      if (!document || !collection) {
        throw new Error("Invalid document or collection");
      }

      await validateEnumFieldValues(collection.properties, values);

      await validateRelationFieldValues(
        tx,
        organizationId,
        collectionId,
        documentId,
        collection.properties,
        values,
      );

      const existing = await maybeOne(
        tx.run(
          zql.collection_fields
            .where("document_id", documentId)
            .where("collection_id", collectionId)
            .one(),
        ),
      );

      if (existing) {
        await tx.mutate.collection_fields.update({
          id: existing.id,
          values: {
            ...(existing.values as Record<string, unknown>),
            ...(values as Record<string, unknown>),
          } as ReadonlyJSONValue,
        });
        return;
      }

      await tx.mutate.collection_fields.insert(
        withTimestamps({
          id: createId(),
          document_id: documentId,
          collection_id: collectionId,
          values: values as ReadonlyJSONValue,
          orphaned_values: {},
        }),
      );
    },
  ),

  createView: defineMutator(
    z.object({
      viewId: z.string().optional(),
      organizationId: z.string(),
      collectionId: z.string(),
      name: z.string().min(1),
      type: collectionViewTypeSchema.default("table"),
      filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      sortField: z.string().nullable().default(null),
      sortDirection: z.enum(["asc", "desc"]).nullable().default("asc"),
      groupBy: z.string().nullable().default(null),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const collection = await maybeOne(
        tx.run(
          zql.collections
            .where("id", args.collectionId)
            .where("organization_id", args.organizationId)
            .where("deleted_at", "IS", null)
            .one(),
        ),
      );

      if (!collection) {
        throw new Error("Collection not found");
      }

      await tx.mutate.collection_views.insert(
        withTimestamps({
          id: args.viewId ?? createId(),
          organization_id: args.organizationId,
          collection_id: args.collectionId,
          name: args.name.trim(),
          type: args.type,
          config: {
            filters: args.filters,
            sortField: args.sortField,
            sortDirection: args.sortDirection,
            groupBy: args.groupBy,
          } as ReadonlyJSONValue,
          deleted_at: null,
        }),
      );
    },
  ),

  updateView: defineMutator(
    z.object({
      viewId: z.string(),
      organizationId: z.string(),
      name: z.string().min(1).optional(),
      type: collectionViewTypeSchema.optional(),
      filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      sortField: z.string().nullable().optional(),
      sortDirection: z.enum(["asc", "desc"]).nullable().optional(),
      groupBy: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const view = await getCollectionViewById(tx, args.organizationId, args.viewId);
      if (!view) {
        throw new Error("View not found");
      }

      const updates: any = { id: args.viewId };
      if (args.name !== undefined) {
        updates.name = args.name.trim();
      }
      if (args.type !== undefined) {
        updates.type = args.type;
      }
      if (
        args.filters !== undefined ||
        args.sortField !== undefined ||
        args.sortDirection !== undefined ||
        args.groupBy !== undefined
      ) {
        updates.config = {
          ...(view.config ?? {}),
          ...(args.filters !== undefined ? { filters: args.filters } : {}),
          ...(args.sortField !== undefined ? { sortField: args.sortField } : {}),
          ...(args.sortDirection !== undefined ? { sortDirection: args.sortDirection } : {}),
          ...(args.groupBy !== undefined ? { groupBy: args.groupBy } : {}),
        } as ReadonlyJSONValue;
      }

      await tx.mutate.collection_views.update(updates);
    },
  ),

  deleteView: defineMutator(
    z.object({
      viewId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const view = await getCollectionViewById(tx, args.organizationId, args.viewId);
      if (!view) {
        throw new Error("View not found");
      }

      const collectionViews = await tx.run(
        zql.collection_views
          .where("organization_id", args.organizationId)
          .where("collection_id", view.collection_id)
          .where("deleted_at", "IS", null),
      );

      if (collectionViews.length <= 1) {
        throw new Error("A collection must have at least one view");
      }

      await tx.mutate.collection_views.update({
        id: args.viewId,
        deleted_at: Date.now(),
      });
    },
  ),

  upsertViewUsage: defineMutator(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
      viewId: z.string(),
      blockId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const [document, view] = await Promise.all([
        maybeOne(
          tx.run(
            zql.documents
              .where("id", args.documentId)
              .where("organization_id", args.organizationId)
              .where("deleted_at", "IS", null)
              .one(),
          ),
        ),
        getCollectionViewById(tx, args.organizationId, args.viewId),
      ]);

      if (!document) {
        throw new Error("Document not found");
      }

      if (!view) {
        throw new Error("View not found");
      }

      const existingUsage = await maybeOne(
        tx.run(
          zql.collection_view_usages
            .where("document_id", args.documentId)
            .where("block_id", args.blockId)
            .one(),
        ),
      );

      if (existingUsage) {
        await tx.mutate.collection_view_usages.update({
          id: existingUsage.id,
          view_id: args.viewId,
          collection_id: view.collection_id,
        });
        return;
      }

      await tx.mutate.collection_view_usages.insert(
        withTimestamps({
          id: createId(),
          organization_id: args.organizationId,
          document_id: args.documentId,
          view_id: args.viewId,
          collection_id: view.collection_id,
          block_id: args.blockId,
        }),
      );
    },
  ),

  deleteViewUsageByBlock: defineMutator(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
      blockId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existingUsage = await maybeOne(
        tx.run(
          zql.collection_view_usages
            .where("organization_id", args.organizationId)
            .where("document_id", args.documentId)
            .where("block_id", args.blockId)
            .one(),
        ),
      );

      if (!existingUsage) {
        return;
      }

      await tx.mutate.collection_view_usages.delete({ id: existingUsage.id });
    },
  ),

  delete: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await maybeOne(
        tx.run(
          zql.collections
            .where("id", args.collectionId)
            .where("organization_id", args.organizationId)
            .one(),
        ),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      const activeUsages = await tx.run(
        zql.collection_view_usages
          .where("organization_id", args.organizationId)
          .where("collection_id", args.collectionId),
      );

      if (activeUsages.length > 0) {
        throw new Error(
          `This collection is referenced by ${activeUsages.length} view block${activeUsages.length === 1 ? "" : "s"}. Remove those references before deleting the collection.`,
        );
      }

      await tx.mutate.collections.update({
        id: args.collectionId,
        deleted_at: Date.now(),
      });

      const views = await tx.run(
        zql.collection_views
          .where("organization_id", args.organizationId)
          .where("collection_id", args.collectionId)
          .where("deleted_at", "IS", null),
      );

      for (const view of views) {
        await tx.mutate.collection_views.update({
          id: view.id,
          deleted_at: Date.now(),
        });
      }
    },
  ),

  restore: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await maybeOne(
        tx.run(
          zql.collections
            .where("id", args.collectionId)
            .where("organization_id", args.organizationId)
            .one(),
        ),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      await tx.mutate.collections.update({
        id: args.collectionId,
        deleted_at: null,
      });

      const views = await tx.run(
        zql.collection_views
          .where("organization_id", args.organizationId)
          .where("collection_id", args.collectionId),
      );

      for (const view of views) {
        await tx.mutate.collection_views.update({
          id: view.id,
          deleted_at: null,
        });
      }
    },
  ),
};
