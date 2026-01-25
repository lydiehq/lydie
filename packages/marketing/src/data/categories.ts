import { db, templateCategoriesTable } from "@lydie/database";

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export const categories: Category[] = [
  {
    id: "career-hiring",
    name: "Career & Hiring",
    slug: "career-hiring",
  },
  {
    id: "writing-publishing",
    name: "Writing & Publishing",
    slug: "writing-publishing",
  },
  {
    id: "business-operations",
    name: "Business & Operations",
    slug: "business-operations",
  },
  {
    id: "product-design-engineering",
    name: "Product, Design & Engineering",
    slug: "product-design-engineering",
  },
  {
    id: "education-learning",
    name: "Education & Learning",
    slug: "education-learning",
  },
  {
    id: "personal-life",
    name: "Personal & Life",
    slug: "personal-life",
  },
];

export const getMostPopularCategories = (count: number = 10): Category[] => {
  return categories.slice(0, count);
};

export const getCategoryBySlug = (slug: string): Category | undefined => {
  return categories.find((cat) => cat.slug === slug);
};

export async function getCategoriesFromDb(): Promise<Category[]> {
  try {
    const dbCategories = await db.select().from(templateCategoriesTable);
    return dbCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));
  } catch (error) {
    console.error("Error fetching categories from database:", error);
    // Fallback to hardcoded categories
    return categories;
  }
}

export async function getMostPopularCategoriesFromDb(count: number = 10): Promise<Category[]> {
  try {
    const dbCategories = await getCategoriesFromDb();
    return dbCategories.slice(0, count);
  } catch (error) {
    console.error("Error fetching popular categories from database:", error);
    // Fallback to hardcoded categories
    return getMostPopularCategories(count);
  }
}
