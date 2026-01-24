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
  categories: string[]
  documents: TemplateDocument[]
}

import { convertYjsToJson } from "@lydie/core/yjs-to-json"
import { db, templatesTable, templateDocumentsTable } from "@lydie/database"
import { eq, desc } from "drizzle-orm"

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

    return transformDbTemplateToTemplate({
      ...template,
      documents,
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

        return {
          ...template,
          documents,
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

  return {
    id: dbTemplate.id,
    slug: dbTemplate.slug,
    name: dbTemplate.name,
    description: dbTemplate.description || "",
    categories: [], // Categories can be added later if needed
    documents: rootDocs,
  }
}
