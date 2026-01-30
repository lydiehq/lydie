import {
  db,
  templateCategoriesTable,
  templateCategoryAssignmentsTable,
  templatesTable,
} from "@lydie/database";
import { desc, eq, inArray } from "drizzle-orm";

import type { Category } from "./categories";

export type TemplateDocument = {
  id: string;
  title: string;
  content: any;
  children?: TemplateDocument[];
};

export type Template = {
  id: string;
  slug: string;
  name: string;
  description: string;
  teaser: string;
  detailedDescription: string;
  categories: Category[];
  documents: TemplateDocument[];
};

async function fetchCategories(templateId: string): Promise<Category[]> {
  const assignments = await db
    .select({ categoryId: templateCategoryAssignmentsTable.categoryId })
    .from(templateCategoryAssignmentsTable)
    .where(eq(templateCategoryAssignmentsTable.templateId, templateId));

  const categoryIds = assignments.map((a) => a.categoryId);
  if (categoryIds.length === 0) return [];

  const dbCategories = await db
    .select()
    .from(templateCategoriesTable)
    .where(inArray(templateCategoriesTable.id, categoryIds));

  // Fetch all categories to build paths
  const allCategories = await db.select().from(templateCategoriesTable);

  // Generate paths for each category
  return dbCategories.map((cat) => {
    const path = generateCategoryPath(cat, allCategories);
    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId,
      path,
    };
  });
}

// Generate full path for nested categories
function generateCategoryPath(
  category: { id: string; slug: string; parentId: string | null },
  allCategories: { id: string; slug: string; parentId: string | null }[],
): string {
  const pathSegments: string[] = [];
  let current: typeof category | undefined = category;

  while (current) {
    pathSegments.unshift(current.slug);
    current = allCategories.find((cat) => cat.id === current?.parentId);
  }

  return `/templates/categories/${pathSegments.join("/")}`;
}

export async function getTemplate(slug: string): Promise<Template | undefined> {
  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.slug, slug))
    .limit(1);
  if (!template) return undefined;

  const categories = await fetchCategories(template.id);

  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description || "",
    teaser: template.teaser || "",
    detailedDescription: template.detailedDescription || "",
    categories,
    documents: (template.previewData as TemplateDocument[]) || [],
  };
}

export async function getAllTemplates(): Promise<Template[]> {
  const templates = await db.select().from(templatesTable).orderBy(desc(templatesTable.createdAt));

  return Promise.all(
    templates.map(async (template) => ({
      id: template.id,
      slug: template.slug,
      name: template.name,
      description: template.description || "",
      teaser: template.teaser || "",
      detailedDescription: template.detailedDescription || "",
      categories: await fetchCategories(template.id),
      documents: (template.previewData as TemplateDocument[]) || [],
    })),
  );
}
