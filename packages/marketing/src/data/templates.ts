import {
  db,
  templateCategoryAssignmentsTable,
  templateFaqsTable,
  templatesTable,
} from "@lydie/database";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { getCategoriesFromDb, type Category } from "./categories";

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
  thumbnailSrc: string | null;
  categories: Category[];
  documents: TemplateDocument[];
  faqs: Array<{ question: string; answer: string }>;
};

// Cache for all templates to avoid repeated DB queries during build
let allTemplatesCache: Template[] | null = null;
let allTemplatesCachePromise: Promise<Template[]> | null = null;

export async function getTemplate(slug: string): Promise<Template | undefined> {
  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.slug, slug))
    .limit(1);
  if (!template) return undefined;

  // Fetch categories with proper paths
  const allCategories = await getCategoriesFromDb();
  const categoryIdMap = new Map(allCategories.map((c) => [c.id, c]));

  const assignments = await db
    .select({ categoryId: templateCategoryAssignmentsTable.categoryId })
    .from(templateCategoryAssignmentsTable)
    .where(eq(templateCategoryAssignmentsTable.templateId, template.id));

  const categories: Category[] = assignments
    .map((a) => categoryIdMap.get(a.categoryId))
    .filter((c): c is Category => c !== undefined);

  // Fetch FAQs
  const faqs = await db
    .select({
      question: templateFaqsTable.question,
      answer: templateFaqsTable.answer,
    })
    .from(templateFaqsTable)
    .where(eq(templateFaqsTable.templateId, template.id))
    .orderBy(asc(templateFaqsTable.sortOrder));

  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description || "",
    teaser: template.teaser || "",
    detailedDescription: template.detailedDescription || "",
    thumbnailSrc: template.thumbnailSrc || null,
    categories,
    documents: (template.previewData as TemplateDocument[]) || [],
    faqs,
  };
}

export async function getAllTemplates(): Promise<Template[]> {
  // Return cached result if available
  if (allTemplatesCache) {
    return allTemplatesCache;
  }

  // Return in-flight promise if one exists (deduplicate concurrent calls)
  if (allTemplatesCachePromise) {
    return allTemplatesCachePromise;
  }

  // Create the fetch promise
  allTemplatesCachePromise = (async () => {
    // Fetch all templates
    const templates = await db
      .select()
      .from(templatesTable)
      .orderBy(desc(templatesTable.createdAt));

    if (templates.length === 0) {
      allTemplatesCache = [];
      return [];
    }

    const templateIds = templates.map((t) => t.id);

    // Fetch all categories once (uses cache)
    const allCategories = await getCategoriesFromDb();
    const categoryIdMap = new Map(allCategories.map((c) => [c.id, c]));

    // Fetch all category assignments for all templates in ONE query
    const allAssignments = await db
      .select({
        templateId: templateCategoryAssignmentsTable.templateId,
        categoryId: templateCategoryAssignmentsTable.categoryId,
      })
      .from(templateCategoryAssignmentsTable)
      .where(inArray(templateCategoryAssignmentsTable.templateId, templateIds));

    // Group assignments by template
    const assignmentsByTemplate = new Map<string, string[]>();
    for (const assignment of allAssignments) {
      const existing = assignmentsByTemplate.get(assignment.templateId) || [];
      existing.push(assignment.categoryId);
      assignmentsByTemplate.set(assignment.templateId, existing);
    }

    // Fetch all FAQs for all templates in ONE query
    const allFaqs = await db
      .select({
        templateId: templateFaqsTable.templateId,
        question: templateFaqsTable.question,
        answer: templateFaqsTable.answer,
      })
      .from(templateFaqsTable)
      .where(inArray(templateFaqsTable.templateId, templateIds))
      .orderBy(asc(templateFaqsTable.sortOrder));

    // Group FAQs by template
    const faqsByTemplate = new Map<string, Array<{ question: string; answer: string }>>();
    for (const faq of allFaqs) {
      const existing = faqsByTemplate.get(faq.templateId) || [];
      existing.push({ question: faq.question, answer: faq.answer });
      faqsByTemplate.set(faq.templateId, existing);
    }

    // Build templates with their categories and FAQs
    const result: Template[] = templates.map((template) => {
      const categoryIds = assignmentsByTemplate.get(template.id) || [];
      const categories: Category[] = categoryIds
        .map((id) => categoryIdMap.get(id))
        .filter((c): c is Category => c !== undefined);

      return {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description || "",
        teaser: template.teaser || "",
        detailedDescription: template.detailedDescription || "",
        thumbnailSrc: template.thumbnailSrc || null,
        categories,
        documents: (template.previewData as TemplateDocument[]) || [],
        faqs: faqsByTemplate.get(template.id) || [],
      };
    });

    allTemplatesCache = result;
    return result;
  })();

  return allTemplatesCachePromise;
}

// Clear the cache (useful for testing or if data changes)
export function clearAllTemplatesCache(): void {
  allTemplatesCache = null;
  allTemplatesCachePromise = null;
}
