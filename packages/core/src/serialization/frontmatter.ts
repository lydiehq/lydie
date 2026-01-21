/**
 * Parse frontmatter from Markdown/MDX files
 * Extracts YAML frontmatter (between --- delimiters) and returns it as an object
 */

export interface FrontmatterResult {
  frontmatter: Record<string, any>
  contentWithoutFrontmatter: string
}

/**
 * Parse frontmatter from a markdown/mdx file
 * Supports YAML frontmatter delimited by ---
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match || !match[1] || !match[2]) {
    return {
      frontmatter: {},
      contentWithoutFrontmatter: content,
    }
  }

  const frontmatterYaml = match[1]
  const contentWithoutFrontmatter = match[2]
  const frontmatter: Record<string, any> = {}

  // Simple YAML parsing - handles key: value pairs
  // Supports strings, numbers, booleans, and quoted strings
  const lines = frontmatterYaml.split("\n")
  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    const colonIndex = trimmedLine.indexOf(":")
    if (colonIndex > 0) {
      const key = trimmedLine.substring(0, colonIndex).trim()
      let value = trimmedLine.substring(colonIndex + 1).trim()

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // Try to parse as number
      if (/^-?\d+$/.test(value)) {
        frontmatter[key] = parseInt(value, 10)
      } else if (/^-?\d+\.\d+$/.test(value)) {
        frontmatter[key] = parseFloat(value)
      } else if (value === "true" || value === "false") {
        // Parse boolean
        frontmatter[key] = value === "true"
      } else {
        // String value
        frontmatter[key] = value
      }
    }
  }

  return { frontmatter, contentWithoutFrontmatter }
}
