import { db } from "../index"
import { templatesTable, templateDocumentsTable } from "../schema"
import { createId } from "@lydie/core/id"
import { convertJsonToYjs } from "@lydie/core/yjs-to-json"

// Import existing template data
const templates = {
  resume: {
    id: "resume-template",
    slug: "resume",
    name: "Developer Resume Template",
    description: "A professional resume template for developers showcasing skills and experience.",
    categories: ["Resume", "Professional", "Developer"],
    documents: [
      {
        id: "doc-1",
        title: "Resume",
        content: `
          <h2>John Doe</h2>
          <p>Senior Software Engineer</p>
          <p>Email: john@example.com | Phone: (555) 123-4567</p>
          
          <h3>Summary</h3>
          <p>Experienced software engineer with 8+ years building scalable web applications. 
          Specialized in React, TypeScript, and Node.js.</p>
          
          <h3>Experience</h3>
          <h4>Senior Software Engineer - Tech Corp (2020 - Present)</h4>
          <ul>
            <li>Led development of customer-facing dashboard serving 100K+ users</li>
            <li>Improved application performance by 40% through code optimization</li>
            <li>Mentored 5 junior developers on best practices and code quality</li>
          </ul>
          
          <h4>Software Engineer - StartupXYZ (2017 - 2020)</h4>
          <ul>
            <li>Built REST APIs handling 1M+ requests per day</li>
            <li>Implemented CI/CD pipeline reducing deployment time by 60%</li>
            <li>Collaborated with design team on user interface improvements</li>
          </ul>
          
          <h3>Skills</h3>
          <ul>
            <li><strong>Languages:</strong> JavaScript, TypeScript, Python, Go</li>
            <li><strong>Frontend:</strong> React, Next.js, Tailwind CSS</li>
            <li><strong>Backend:</strong> Node.js, Express, PostgreSQL, Redis</li>
            <li><strong>Tools:</strong> Git, Docker, AWS, GitHub Actions</li>
          </ul>
          
          <h3>Education</h3>
          <p><strong>Bachelor of Science in Computer Science</strong><br />
          University of Technology, 2017</p>
        `,
        children: [
          {
            id: "doc-2",
            title: "Cover Letter",
            content: `
              <p>Dear Hiring Manager,</p>
              
              <p>I am writing to express my strong interest in the Senior Software Engineer position 
              at your company. With over 8 years of experience building scalable web applications and 
              a proven track record of delivering high-quality software solutions, I am confident I 
              would be a valuable addition to your team.</p>
              
              <p>In my current role at Tech Corp, I have led the development of a customer-facing 
              dashboard that serves over 100,000 users daily. Through careful optimization and 
              architectural improvements, I increased application performance by 40%, resulting in 
              significantly improved user satisfaction scores.</p>
              
              <p>I am particularly excited about this opportunity because of your company's commitment 
              to innovation and technical excellence. I believe my experience with React, TypeScript, 
              and modern cloud technologies would allow me to contribute immediately to your team's 
              success.</p>
              
              <p>Thank you for considering my application. I look forward to the opportunity to discuss 
              how my skills and experience align with your needs.</p>
              
              <p>Sincerely,<br />
              John Doe</p>
            `,
          },
          {
            id: "doc-3",
            title: "References",
            content: `
              <h3>Professional References</h3>
              
              <h4>Jane Smith</h4>
              <p><strong>Engineering Manager, Tech Corp</strong><br />
              Email: jane.smith@techcorp.com<br />
              Phone: (555) 234-5678<br />
              Relationship: Direct Manager (2020 - Present)</p>
              
              <h4>Bob Johnson</h4>
              <p><strong>CTO, StartupXYZ</strong><br />
              Email: bob@startupxyz.com<br />
              Phone: (555) 345-6789<br />
              Relationship: Former Manager (2017 - 2020)</p>
              
              <h4>Alice Chen</h4>
              <p><strong>Senior Staff Engineer, Tech Corp</strong><br />
              Email: alice.chen@techcorp.com<br />
              Phone: (555) 456-7890<br />
              Relationship: Colleague and Technical Lead</p>
            `,
          },
        ],
      },
    ],
  },
}

function htmlToTiptapJson(html: string) {
  // Simple HTML to TipTap JSON converter
  // In production, you'd want to use a proper HTML parser
  const lines = html.trim().split("\n").filter(line => line.trim())
  
  const content: any[] = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    if (trimmed.startsWith("<h2>")) {
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: trimmed.replace(/<\/?h2>/g, "") }],
      })
    } else if (trimmed.startsWith("<h3>")) {
      content.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: trimmed.replace(/<\/?h3>/g, "") }],
      })
    } else if (trimmed.startsWith("<h4>")) {
      content.push({
        type: "heading",
        attrs: { level: 4 },
        content: [{ type: "text", text: trimmed.replace(/<\/?h4>/g, "") }],
      })
    } else if (trimmed.startsWith("<p>") && trimmed.endsWith("</p>")) {
      const text = trimmed.replace(/<\/?p>/g, "").replace(/<br ?\/?>/g, "\n").replace(/<\/?strong>/g, "")
      content.push({
        type: "paragraph",
        content: [{ type: "text", text }],
      })
    } else if (trimmed.startsWith("<ul>")) {
      // Start of bullet list - we'll handle items next
      continue
    } else if (trimmed.startsWith("<li>")) {
      const text = trimmed.replace(/<\/?li>/g, "").replace(/<\/?strong>/g, "")
      content.push({
        type: "bulletList",
        content: [{
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text }],
          }],
        }],
      })
    } else if (trimmed.startsWith("</ul>") || trimmed.startsWith("</li>")) {
      continue
    }
  }
  
  return {
    type: "doc",
    content,
  }
}

async function migrateTemplates() {
  console.log("Starting template migration...")

  for (const [key, template] of Object.entries(templates)) {
    console.log(`\nMigrating template: ${template.name}`)

    // Create template
    const templateId = createId()
    await db.insert(templatesTable).values({
      id: templateId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      previewData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(`  ✓ Created template: ${templateId}`)

    // Create template documents
    const docIdMap = new Map<string, string>()
    
    // Helper function to process documents recursively
    async function processDocument(
      doc: any,
      parentId: string | null = null,
      sortOrder: number = 0,
    ) {
      const newDocId = createId()
      docIdMap.set(doc.id, newDocId)

      // Convert HTML content to TipTap JSON
      const tiptapJson = htmlToTiptapJson(doc.content)
      const yjsState = convertJsonToYjs(tiptapJson)

      await db.insert(templateDocumentsTable).values({
        id: newDocId,
        templateId: templateId,
        title: doc.title,
        content: yjsState,
        parentId,
        sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      console.log(`    ✓ Created document: ${doc.title}`)

      // Process children
      if (doc.children) {
        for (let i = 0; i < doc.children.length; i++) {
          await processDocument(doc.children[i], newDocId, i)
        }
      }
    }

    // Process all documents
    for (let i = 0; i < template.documents.length; i++) {
      await processDocument(template.documents[i], null, i)
    }

    console.log(`  ✓ Migrated ${docIdMap.size} documents`)
  }

  console.log("\n✅ Template migration complete!")
}

// Run migration
migrateTemplates()
  .then(() => {
    console.log("Migration successful")
    process.exit(0)
  })
  .catch((error) => {
    console.error("Migration failed:", error)
    process.exit(1)
  })
