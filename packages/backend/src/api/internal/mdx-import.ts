import { Hono } from "hono"
import { db, documentsTable, documentComponentsTable } from "@lydie/database"
import { HTTPException } from "hono/http-exception"
import { createId } from "@lydie/core/id"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing"
import { slugify } from "@lydie/core/utils"
import { convertJsonToYjs } from "@lydie/core/yjs-to-json"
import {
	deserializeFromMDX,
	extractMDXComponents,
	parseFrontmatter,
	type MDXComponent,
} from "@lydie/core/serialization/mdx"

type Variables = {
	organizationId: string
	user: any
}

interface ParsedMDXContent {
	title: string
	slug?: string
	content: any // TipTap JSON structure
	components: MDXComponent[]
}

interface MDXFrontmatter {
	title?: string
	slug?: string
	[key: string]: any
}

// mdxToTipTapJSON is now replaced by deserializeFromMDX from @lydie/core/serialization

function parseMDXContent(
	mdxContent: string,
	filename: string | undefined,
	componentSchemas: Record<string, any> = {},
): ParsedMDXContent & { customFields?: Record<string, string | number> } {
	// Parse frontmatter first
	const { frontmatter, contentWithoutFrontmatter } = parseFrontmatter(mdxContent)

	const lines = contentWithoutFrontmatter.split("\n")

	// Title priority: frontmatter.title > first # heading > filename (without extension) > fallback
	let title = ""
	let contentStartIndex = 0

	// 1. Check frontmatter first
	if (frontmatter.title) {
		title = frontmatter.title
	} else {
		// 2. Look for first heading
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim()
			if (line.startsWith("# ")) {
				title = line.substring(2).trim()
				contentStartIndex = i + 1
				break
			}
		}

		// 3. Use filename if no title found
		if (!title && filename) {
			title = filename.replace(/\.(mdx?|md)$/i, "")
		}

		// 4. Fallback
		if (!title) {
			title = "Imported Document"
		}
	}

	// Slug priority: frontmatter.slug > filename (without extension) > slugified title
	let slug = ""
	if (frontmatter.slug) {
		slug = frontmatter.slug
	} else if (filename) {
		slug = filename.replace(/\.(mdx?|md)$/i, "")
	} else {
		slug = slugify(title)
	}

	const contentLines = lines.slice(contentStartIndex)
	const contentString = contentLines.join("\n")

	// Extract components first to get the list for component creation
	const { components } = extractMDXComponents(contentString)

	// Use the core MDX deserializer with component schemas
	const tipTapContent = deserializeFromMDX(contentString, {
		componentSchemas,
	})

	// Convert frontmatter to customFields format (only string and number values)
	// Exclude title and slug as they're handled separately
	const customFields: Record<string, string | number> = {}
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key !== "title" && key !== "slug") {
			if (typeof value === "string" || typeof value === "number") {
				customFields[key] = value
			} else if (typeof value === "boolean") {
				// Convert boolean to string
				customFields[key] = String(value)
			}
		}
	}

	const result = {
		title,
		slug,
		content: tipTapContent,
		components,
		customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
	}

	return result
}

async function getOrCreatePageByPath(
	pagePath: string | null | undefined,
	userId: string,
	organizationId: string,
): Promise<string | undefined> {
	if (!pagePath || pagePath.trim() === "" || pagePath === "/") {
		return undefined // Root level
	}

	// Normalize path: remove leading/trailing slashes and split
	const parts = pagePath
		.replace(/^\/+|\/+$/g, "")
		.split("/")
		.filter((part) => part.length > 0)

	if (parts.length === 0) {
		return undefined
	}

	let currentParentId: string | undefined = undefined

	// Traverse the path, creating pages as needed
	for (const pageName of parts) {
		// Check if page already exists with this title, parent, and organization
		const whereConditions = [
			eq(documentsTable.title, pageName),
			eq(documentsTable.organizationId, organizationId),
			isNull(documentsTable.deletedAt),
		]

		if (currentParentId) {
			whereConditions.push(eq(documentsTable.parentId, currentParentId))
		} else {
			whereConditions.push(isNull(documentsTable.parentId))
		}

		const [existingPage] = await db
			.select()
			.from(documentsTable)
			.where(and(...whereConditions))
			.limit(1)

		if (existingPage) {
			// Reuse existing page
			currentParentId = existingPage.id
		} else {
			// Create new page
			const newPageId = createId()
			const emptyContent = { type: "doc", content: [] }
			const yjsState = convertJsonToYjs(emptyContent)
			await db.insert(documentsTable).values({
				id: newPageId,
				title: pageName,
				slug: newPageId,
				yjsState: yjsState,
				userId,
				organizationId,
				parentId: currentParentId || null,
				indexStatus: "pending",
				published: false,
			})
			currentParentId = newPageId
		}
	}

	return currentParentId
}

export const MDXImportRoute = new Hono<{ Variables: Variables }>()
	.post("/create-page", async (c) => {
		try {
			const { pagePath } = await c.req.json()
			const userId = c.get("user").id
			const organizationId = c.get("organizationId")

			const pageId = await getOrCreatePageByPath(pagePath, userId, organizationId)

			return c.json({ pageId })
		} catch (error) {
			console.error("❌ Page creation error:", error)
			if (error instanceof HTTPException) {
				throw error
			}
			throw new HTTPException(500, {
				message: "Failed to create page",
			})
		}
	})
	.post("/", async (c) => {
		try {
			const { mdxContent, filename, pagePath, parentId } = await c.req.json()
			const userId = c.get("user").id
			const organizationId = c.get("organizationId")

			if (!mdxContent) {
				throw new HTTPException(400, {
					message: "MDX content is required",
				})
			}

			// Parse MDX content first (without component schemas initially)
			const parsed = parseMDXContent(mdxContent, filename, {})

			// If there are components in the parsed content, fetch only the relevant schemas
			let componentSchemas: Record<string, any> = {}
			if (parsed.components.length > 0) {
				const componentNames = [...new Set(parsed.components.map((c) => c.name))]
				const existingComponents = await db
					.select()
					.from(documentComponentsTable)
					.where(
						and(
							inArray(documentComponentsTable.name, componentNames),
							eq(documentComponentsTable.organizationId, organizationId),
						),
					)

				for (const comp of existingComponents) {
					componentSchemas[comp.name] = comp.properties
				}

				// Re-parse with component schemas if we found any
				if (Object.keys(componentSchemas).length > 0) {
					const reparsed = parseMDXContent(mdxContent, filename, componentSchemas)
					parsed.content = reparsed.content
				}
			}

			// Use provided parentId, or get/create page by path if not provided
			let finalParentId: string | undefined = parentId
			if (!finalParentId && pagePath) {
				finalParentId = await getOrCreatePageByPath(pagePath, userId, organizationId)
			}

			// Create document
			const documentId = createId()
			const finalSlug = parsed.slug || documentId

			// Convert TipTap JSON to Yjs format
			const yjsState = convertJsonToYjs(parsed.content)

			const insertData = {
				id: documentId,
				title: parsed.title,
				slug: finalSlug,
				yjsState: yjsState,
				userId,
				organizationId,
				parentId: finalParentId || null,
				customFields: parsed.customFields || null,
				indexStatus: "outdated" as const,
				published: false,
			}

			await db.insert(documentsTable).values(insertData)

			// Verify the inserted document
			const insertedDocument = await db.query.documentsTable.findFirst({
				where: {
					id: documentId,
				},
			})

			if (!insertedDocument) {
				throw new HTTPException(500, {
					message: "Failed to retrieve inserted document",
				})
			}

			if (insertedDocument.yjsState) {
				processDocumentEmbedding(
					{
						documentId: insertedDocument.id,
						yjsState: insertedDocument.yjsState,
						title: insertedDocument.title,
					},
					db,
				).catch((error) => {
					console.error(`Failed to generate embeddings for imported document ${documentId}:`, error)
				})
			}

			// Create document components for any new custom components found
			const createdComponents: string[] = []
			if (parsed.components.length > 0) {
				// Get unique component names
				const uniqueComponents = Array.from(
					new Map(parsed.components.map((c) => [c.name, c])).values(),
				)

				// Filter out components that already exist in our schema map
				const newComponents = uniqueComponents.filter((c) => !componentSchemas[c.name])

				// Batch create new components
				if (newComponents.length > 0) {
					const componentInserts = newComponents.map((component) => {
						// Infer property types from the component props
						const properties: Record<string, { type: string }> = {}
						for (const [key, value] of Object.entries(component.props)) {
							if (typeof value === "boolean") {
								properties[key] = { type: "boolean" }
							} else if (typeof value === "number") {
								properties[key] = { type: "number" }
							} else if (Array.isArray(value)) {
								properties[key] = { type: "array" }
							} else {
								properties[key] = { type: "string" }
							}
						}

						return {
							id: createId(),
							name: component.name,
							properties,
							organizationId,
						}
					})

					// Try to insert all new components at once
					try {
						await db.insert(documentComponentsTable).values(componentInserts)
						createdComponents.push(...componentInserts.map((c) => c.name))
					} catch (error) {
						// If batch insert fails, fall back to individual inserts with duplicate checking
						console.warn("Batch component insert failed, falling back to individual inserts")
						for (const insert of componentInserts) {
							try {
								await db.insert(documentComponentsTable).values(insert)
								createdComponents.push(insert.name)
							} catch (individualError) {
								// Component might already exist due to race condition, skip it
								console.log(`Component ${insert.name} already exists, skipping`)
							}
						}
					}
				}
			}

			const response = {
				success: true,
				documentId,
				title: parsed.title,
				slug: finalSlug,
				parentId: finalParentId,
				componentsFound: parsed.components.length,
				newComponentsCreated: createdComponents,
			}

			return c.json(response)
		} catch (error) {
			console.error("❌ MDX import error:", error)
			if (error instanceof HTTPException) {
				throw error
			}
			throw new HTTPException(500, {
				message: "Failed to import MDX file",
			})
		}
	})
