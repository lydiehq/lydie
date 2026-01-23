export type TemplateDocument = {
  id: string
  title: string
  content: string
  children?: TemplateDocument[]
}

export type Template = {
  id: string
  slug: string
  name: string
  description: string
  categories: string[]
  documents: TemplateDocument[]
}

// Example template data
export const templates: Record<string, Template> = {
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

export function getTemplate(slug: string): Template | undefined {
  return templates[slug]
}

export function getAllTemplates(): Template[] {
  return Object.values(templates)
}
