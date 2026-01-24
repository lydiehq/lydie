import { convertYjsToJson } from "@lydie/core/yjs-to-json"
import {
  db,
  templatesTable,
  templateDocumentsTable,
  templateCategoriesTable,
  templateCategoryAssignmentsTable,
} from "@lydie/database"
import { eq, desc, sql, inArray } from "drizzle-orm"
import type { Category } from "./categories"

export type TemplateDocument = {
  id: string
  title: string
  content: any // TipTap JSON content
  children?: TemplateDocument[]
}

export type Template = {
  id: string
  slug: string
  name: string
  description: string
  teaser: string
  detailedDescription: string
  categories: Category[]
  documents: TemplateDocument[]
}

export async function getTemplate(slug: string): Promise<Template | undefined> {
  try {
    const [template] = await db.select().from(templatesTable).where(eq(templatesTable.slug, slug)).limit(1)

    if (!template) {
      return undefined
    }

    const documents = await db
      .select()
      .from(templateDocumentsTable)
      .where(eq(templateDocumentsTable.templateId, template.id))
      .orderBy(templateDocumentsTable.sortOrder)

    const categoryAssignments = await db
      .select({
        categoryId: templateCategoryAssignmentsTable.categoryId,
      })
      .from(templateCategoryAssignmentsTable)
      .where(eq(templateCategoryAssignmentsTable.templateId, template.id))

    const categoryIds = categoryAssignments.map((ca) => ca.categoryId)
    const categories =
      categoryIds.length > 0
        ? await db
            .select()
            .from(templateCategoriesTable)
            .where(inArray(templateCategoriesTable.id, categoryIds))
        : []

    return transformDbTemplateToTemplate({
      ...template,
      documents,
      categories,
    })
  } catch (error) {
    console.error("Error fetching template:", error)
    return undefined
  }
}

export async function getAllTemplates(): Promise<Template[]> {
  try {
    const templates = await db.select().from(templatesTable).orderBy(desc(templatesTable.createdAt))

    const templatesWithDocs = await Promise.all(
      templates.map(async (template) => {
        const documents = await db
          .select()
          .from(templateDocumentsTable)
          .where(eq(templateDocumentsTable.templateId, template.id))
          .orderBy(templateDocumentsTable.sortOrder)

        // Fetch categories
        const categoryAssignments = await db
          .select({
            categoryId: templateCategoryAssignmentsTable.categoryId,
          })
          .from(templateCategoryAssignmentsTable)
          .where(eq(templateCategoryAssignmentsTable.templateId, template.id))

        const categoryIds = categoryAssignments.map((ca) => ca.categoryId)
        const categories =
          categoryIds.length > 0
            ? await db
                .select()
                .from(templateCategoriesTable)
                .where(inArray(templateCategoriesTable.id, categoryIds))
            : []

        return {
          ...template,
          documents,
          categories,
        }
      }),
    )

    return templatesWithDocs.map(transformDbTemplateToTemplate)
  } catch (error) {
    console.error("Error fetching templates:", error)
    return []
  }
}

function transformDbTemplateToTemplate(dbTemplate: any): Template {
  // Build document tree from flat list
  const docMap = new Map<string, TemplateDocument>()
  const rootDocs: TemplateDocument[] = []

  // First pass: create all documents and convert YJS to JSON
  for (const doc of dbTemplate.documents || []) {
    // Convert YJS state (base64) to TipTap JSON
    let content: any = { type: "doc", content: [] }
    if (doc.content) {
      try {
        const jsonContent = convertYjsToJson(doc.content)
        content = jsonContent || content
      } catch (error) {
        console.error(`Failed to convert YJS for document ${doc.id}:`, error)
      }
    }

    const templateDoc: TemplateDocument = {
      id: doc.id,
      title: doc.title,
      content,
      children: [],
    }
    docMap.set(doc.id, templateDoc)
  }

  // Second pass: build hierarchy
  for (const doc of dbTemplate.documents || []) {
    const templateDoc = docMap.get(doc.id)!
    const parentId = doc.parentId || doc.parent_id
    if (parentId && docMap.has(parentId)) {
      const parent = docMap.get(parentId)!
      if (!parent.children) parent.children = []
      parent.children.push(templateDoc)
    } else {
      rootDocs.push(templateDoc)
    }
  }

  const categoryObjects: Category[] = (dbTemplate.categories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
  }))

  return {
    id: dbTemplate.id,
    slug: dbTemplate.slug,
    name: dbTemplate.name,
    description: dbTemplate.description || "",
    teaser: dbTemplate.teaser || "",
    detailedDescription: dbTemplate.detailedDescription || dbTemplate.detailed_description || "",
    categories: categoryObjects,
    documents: rootDocs,
  }
}
