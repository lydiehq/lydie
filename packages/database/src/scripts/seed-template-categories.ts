import { db } from "../index";
import { templateCategoriesTable, templateCategoryAssignmentsTable } from "../schema";

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
};

const categories: Category[] = [
  // Career and hiring
  { id: "career-hiring", name: "Career and hiring", slug: "career-hiring" },
  { id: "resume", name: "Resume", slug: "resume", parentId: "career-hiring" },
  { id: "cover-letters", name: "Cover letters", slug: "cover-letters", parentId: "career-hiring" },
  { id: "interviewing", name: "Interviewing", slug: "interviewing", parentId: "career-hiring" },
  { id: "job-search", name: "Job search", slug: "job-search", parentId: "career-hiring" },
  {
    id: "people-management",
    name: "People management",
    slug: "people-management",
    parentId: "career-hiring",
  },

  // Writing and publishing
  { id: "writing-publishing", name: "Writing and publishing", slug: "writing-publishing" },
  {
    id: "blogging-seo",
    name: "Blogging and SEO",
    slug: "blogging-seo",
    parentId: "writing-publishing",
  },
  {
    id: "newsletters-email",
    name: "Newsletters and email",
    slug: "newsletters-email",
    parentId: "writing-publishing",
  },
  {
    id: "books-long-form",
    name: "Books and long-form",
    slug: "books-long-form",
    parentId: "writing-publishing",
  },
  {
    id: "editorial-publishing-ops",
    name: "Editorial and publishing ops",
    slug: "editorial-publishing-ops",
    parentId: "writing-publishing",
  },
  { id: "pr-media", name: "PR and media", slug: "pr-media", parentId: "writing-publishing" },
  { id: "scripts", name: "Scripts", slug: "scripts", parentId: "writing-publishing" },

  // Business and operations
  { id: "business-operations", name: "Business and operations", slug: "business-operations" },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    slug: "meeting-notes",
    parentId: "business-operations",
  },
  { id: "marketing", name: "Marketing", slug: "marketing", parentId: "business-operations" },
  { id: "sales", name: "Sales", slug: "sales", parentId: "business-operations" },
  { id: "bids-rfps", name: "Bids and RFPs", slug: "bids-rfps", parentId: "business-operations" },
  {
    id: "consulting-services",
    name: "Consulting and services",
    slug: "consulting-services",
    parentId: "business-operations",
  },
  {
    id: "partnerships-sponsorships",
    name: "Partnerships and sponsorships",
    slug: "partnerships-sponsorships",
    parentId: "business-operations",
  },
  {
    id: "strategy-planning",
    name: "Strategy and planning",
    slug: "strategy-planning",
    parentId: "business-operations",
  },
  {
    id: "project-management",
    name: "Project management",
    slug: "project-management",
    parentId: "business-operations",
  },
  { id: "operations", name: "Operations", slug: "operations", parentId: "business-operations" },
  {
    id: "customer-support",
    name: "Customer support",
    slug: "customer-support",
    parentId: "business-operations",
  },
  {
    id: "funding-grants",
    name: "Funding and grants",
    slug: "funding-grants",
    parentId: "business-operations",
  },

  // Personal and life
  { id: "personal-life", name: "Personal and life", slug: "personal-life" },
  {
    id: "personal-finance",
    name: "Personal finance",
    slug: "personal-finance",
    parentId: "personal-life",
  },
  { id: "budget", name: "Budget", slug: "budget", parentId: "personal-finance" },
  {
    id: "expense-tracker",
    name: "Expense tracker",
    slug: "expense-tracker",
    parentId: "personal-finance",
  },
  { id: "taxes", name: "Taxes", slug: "taxes", parentId: "personal-finance" },
  {
    id: "subscription-tracker",
    name: "Subscription tracker",
    slug: "subscription-tracker",
    parentId: "personal-finance",
  },
  {
    id: "planning-productivity",
    name: "Planning and productivity",
    slug: "planning-productivity",
    parentId: "personal-life",
  },
  { id: "health", name: "Health", slug: "health", parentId: "personal-life" },
  { id: "fitness", name: "Fitness", slug: "fitness", parentId: "health" },
  { id: "mental-health", name: "Mental health", slug: "mental-health", parentId: "health" },
  { id: "sleep-tracking", name: "Sleep tracking", slug: "sleep-tracking", parentId: "health" },
  { id: "home-family", name: "Home and family", slug: "home-family", parentId: "personal-life" },
  { id: "travel", name: "Travel", slug: "travel", parentId: "personal-life" },

  // Education and learning
  { id: "education-learning", name: "Education and learning", slug: "education-learning" },
  { id: "class-notes", name: "Class notes", slug: "class-notes", parentId: "education-learning" },
  {
    id: "research-writing",
    name: "Research and writing",
    slug: "research-writing",
    parentId: "education-learning",
  },
  { id: "teaching", name: "Teaching", slug: "teaching", parentId: "education-learning" },
  {
    id: "learning-systems",
    name: "Learning systems",
    slug: "learning-systems",
    parentId: "education-learning",
  },
];

async function seedTemplateCategories() {
  console.log(`Environment: ${process.env.APP_STAGE || "development"}`);
  console.log(`Starting to seed template categories...`);
  console.log(`Connecting to database...`);

  // Delete all existing category assignments first
  console.log(`\n🗑️  Deleting existing category assignments...`);
  await db.delete(templateCategoryAssignmentsTable);
  console.log(`✅ Deleted all category assignments`);

  // Delete all existing categories
  console.log(`\n🗑️  Deleting existing categories...`);
  await db.delete(templateCategoriesTable);
  console.log(`✅ Deleted all categories`);

  // Seed new categories (parents first, then children)
  console.log(`\n📝 Creating new categories...`);
  let created = 0;

  // Insert in order to respect foreign key constraints
  const sortedCategories = sortCategoriesByHierarchy(categories);

  for (const category of sortedCategories) {
    try {
      await db.insert(templateCategoriesTable).values({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const indent = category.parentId ? (isGrandchild(category, categories) ? "    " : "  ") : "";
      console.log(`${indent}✅ Created category "${category.name}"`);
      created++;
    } catch (error) {
      console.error(`❌ Error creating category "${category.name}":`, error);
    }
  }

  console.log(`\n✅ Completed!`);
  console.log(`   🗑️  Deleted all existing categories and assignments`);
  console.log(`   ✅ Created: ${created} categories`);
  console.log(`   📊 Total: ${categories.length}`);
}

// Sort categories to ensure parents are created before children
function sortCategoriesByHierarchy(cats: Category[]): Category[] {
  const result: Category[] = [];
  const processed = new Set<string>();

  // Helper to add a category and its dependencies
  function addCategory(cat: Category) {
    if (processed.has(cat.id)) return;

    // If it has a parent, ensure parent is added first
    if (cat.parentId) {
      const parent = cats.find((c) => c.id === cat.parentId);
      if (parent) addCategory(parent);
    }

    result.push(cat);
    processed.add(cat.id);
  }

  // Add all categories
  for (const cat of cats) {
    addCategory(cat);
  }

  return result;
}

// Helper to check if a category is a grandchild (3rd level)
function isGrandchild(cat: Category, cats: Category[]): boolean {
  if (!cat.parentId) return false;
  const parent = cats.find((c) => c.id === cat.parentId);
  return parent ? !!parent.parentId : false;
}

seedTemplateCategories()
  .then(() => {
    console.log("✅ Seed successful");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  });
