import { db } from "../index"
import { Resource } from "sst"
import { templateCategoriesTable } from "../schema"
import { eq } from "drizzle-orm"

const categories = [
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
]

async function seedTemplateCategories() {
  console.log(`Environment: ${Resource.App.stage}`)
  console.log(`Starting to seed template categories...`)
  console.log(`Connecting to database...`)

  let created = 0
  let skipped = 0

  for (const category of categories) {
    try {
      const existing = await db.query.templateCategoriesTable.findFirst({
        where: { slug: category.slug },
      })

      if (existing) {
        console.log(`⏭️  Skipping category "${category.name}" (already exists)`)
        skipped++
        continue
      }

      await db.insert(templateCategoriesTable).values({
        id: category.id,
        name: category.name,
        slug: category.slug,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      console.log(`✅ Created category "${category.name}"`)
      created++
    } catch (error) {
      console.error(`❌ Error creating category "${category.name}":`, error)
    }
  }

  console.log(`\n✅ Completed!`)
  console.log(`   ✅ Created: ${created}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   📊 Total: ${categories.length}`)
}

seedTemplateCategories()
  .then(() => {
    console.log("✅ Seed successful")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  })
