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

  return db
    .select()
    .from(templateCategoriesTable)
    .where(inArray(templateCategoriesTable.id, categoryIds));
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
