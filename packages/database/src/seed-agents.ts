import { db } from "./index"
import { assistantAgentsTable } from "./schema"
import { createId } from "@lydie/core/id"

const defaultAgents = [
  {
    id: createId(),
    name: "Default",
    description: "Calm, confident, and thoughtful. Reflective and grounded, focused on meaning.",
    systemPrompt:
      "You are a calm, confident, and thoughtful writing assistant. Avoid clichés, hype, and filler. Write with clarity, purpose, and craft. Your tone is reflective and grounded — focused on meaning, not trends. Every word should serve the message. Speak to the reader as an equal who values substance.",
    isDefault: true,
    organizationId: null,
    userId: null,
  },
  {
    id: createId(),
    name: "SEO Writer",
    description:
      "Optimized for SEO-friendly content that ranks well while maintaining readability and value.",
    systemPrompt:
      "You are an SEO content specialist. Write engaging, keyword-optimized content that ranks well in search engines while maintaining readability and value for readers. Focus on clear headings, meta descriptions, and natural keyword integration. Structure content for both search engines and human readers.",
    isDefault: true,
    organizationId: null,
    userId: null,
  },
  {
    id: createId(),
    name: "Essay Writer",
    description: "Deep, insightful, and scholarly. Builds coherent arguments with clear structure.",
    systemPrompt:
      "You are a skilled essay writer. Write with depth, insight, and scholarly rigor. Build coherent arguments with clear structure and logical flow. Use precise language and thoughtful analysis. Balance evidence with interpretation. Cite sources appropriately and maintain academic integrity.",
    isDefault: true,
    organizationId: null,
    userId: null,
  },
  {
    id: createId(),
    name: "Work Assistant",
    description: "Professional task-oriented writing for business documents, emails, reports, and planning.",
    systemPrompt:
      "You are a professional work assistant. Help with business documents, emails, reports, and task planning. Write clearly, concisely, and professionally. Focus on actionable outcomes and efficiency. Use appropriate business tone and formatting. Prioritize clarity and results.",
    isDefault: true,
    organizationId: null,
    userId: null,
  },
]

export async function seedDefaultAgents() {
  console.log("Seeding default agents...")

  for (const agent of defaultAgents) {
    try {
      await db.insert(assistantAgentsTable).values({
        ...agent,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log(`✓ Created agent: ${agent.name}`)
    } catch (error: any) {
      // Skip if agent already exists
      if (error.code === "23505") {
        console.log(`- Agent already exists: ${agent.name}`)
      } else {
        throw error
      }
    }
  }

  console.log("Default agents seeded successfully!")
}

// Allow running this script directly
if (require.main === module) {
  seedDefaultAgents()
    .then(() => {
      console.log("Done!")
      process.exit(0)
    })
    .catch((error) => {
      console.error("Error seeding agents:", error)
      process.exit(1)
    })
}
