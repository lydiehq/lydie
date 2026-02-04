import { db, templateCategoriesTable } from "@lydie/database";

// Cache for categories to avoid repeated DB queries during build
let categoriesCache: Category[] | null = null;
let categoriesCachePromise: Promise<Category[]> | null = null;

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: Category[];
  path?: string; // Full URL path for nested categories
}

// Fallback hardcoded categories (top-level only)
export const categories: Category[] = [
  {
    id: "career-hiring",
    name: "Career and hiring",
    slug: "career-hiring",
    path: "/templates/categories/career-hiring",
  },
  {
    id: "writing-publishing",
    name: "Writing and publishing",
    slug: "writing-publishing",
    path: "/templates/categories/writing-publishing",
  },
  {
    id: "business-operations",
    name: "Business and operations",
    slug: "business-operations",
    path: "/templates/categories/business-operations",
  },
  {
    id: "personal-life",
    name: "Personal and life",
    slug: "personal-life",
    path: "/templates/categories/personal-life",
  },
  {
    id: "education-learning",
    name: "Education and learning",
    slug: "education-learning",
    path: "/templates/categories/education-learning",
  },
];

// Build a nested category tree from flat array
function buildCategoryTree(flatCategories: Category[]): Category[] {
  const categoryMap = new Map<string, Category>();
  const rootCategories: Category[] = [];

  // First pass: create map and initialize children arrays
  for (const cat of flatCategories) {
    categoryMap.set(cat.id, { ...cat, children: [] });
  }

  // Second pass: build tree structure
  for (const cat of categoryMap.values()) {
    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(cat);
      }
    } else {
      rootCategories.push(cat);
    }
  }

  return rootCategories;
}

// Generate full path for nested categories
function generateCategoryPath(category: Category, allCategories: Category[]): string {
  const pathSegments: string[] = [];
  let current: Category | undefined = category;

  while (current) {
    pathSegments.unshift(current.slug);
    current = allCategories.find((cat) => cat.id === current?.parentId);
  }

  return `/templates/categories/${pathSegments.join("/")}`;
}

// Flatten a nested category tree
export function flattenCategories(categories: Category[]): Category[] {
  const result: Category[] = [];

  function flatten(cats: Category[]) {
    for (const cat of cats) {
      result.push(cat);
      if (cat.children && cat.children.length > 0) {
        flatten(cat.children);
      }
    }
  }

  flatten(categories);
  return result;
}

export const getMostPopularCategories = (count: number = 10): Category[] => {
  return categories.slice(0, count);
};

export const getCategoryBySlug = (slug: string): Category | undefined => {
  return categories.find((cat) => cat.slug === slug);
};

export const getCategoryByPath = (
  path: string,
  allCategories: Category[],
): Category | undefined => {
  const slugs = path.split("/").filter(Boolean);

  // Find category by matching the full path
  for (const cat of allCategories) {
    const catPath = generateCategoryPath(cat, allCategories);
    if (catPath === `/templates/categories/${slugs.join("/")}`) {
      return cat;
    }
  }

  return undefined;
};

export async function getCategoriesFromDb(): Promise<Category[]> {
  // Return cached result if available
  if (categoriesCache) {
    return categoriesCache;
  }

  // Return in-flight promise if one exists (deduplicate concurrent calls)
  if (categoriesCachePromise) {
    return categoriesCachePromise;
  }

  // Create the fetch promise
  categoriesCachePromise = (async () => {
    try {
      const dbCategories = await db.select().from(templateCategoriesTable);
      const flatCategories: Category[] = dbCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        parentId: cat.parentId,
      }));

      // Add paths to all categories
      for (const cat of flatCategories) {
        cat.path = generateCategoryPath(cat, flatCategories);
      }

      categoriesCache = flatCategories;
      return flatCategories;
    } catch (error) {
      console.error("Error fetching categories from database:", error);
      // Fallback to hardcoded categories
      categoriesCache = categories;
      return categories;
    } finally {
      // Clear the promise so future calls after cache clear can work
      categoriesCachePromise = null;
    }
  })();

  return categoriesCachePromise;
}

// Clear the cache (useful for testing or if data changes)
export function clearCategoriesCache(): void {
  categoriesCache = null;
  categoriesCachePromise = null;
}

export async function getCategoryTreeFromDb(): Promise<Category[]> {
  try {
    const flatCategories = await getCategoriesFromDb();
    return buildCategoryTree(flatCategories);
  } catch (error) {
    console.error("Error building category tree:", error);
    return buildCategoryTree(categories);
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
