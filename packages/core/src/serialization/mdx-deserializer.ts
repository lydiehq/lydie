export interface MDXComponent {
  name: string
  props: Record<string, any>
  children?: string
}

export interface MDXDeserializeOptions {
  componentSchemas?: Record<string, any>
}

const COMPONENT_REGEX = /<(\w+)([^>]*)>(.*?)<\/\1>|<(\w+)([^>]*?)\/>/gs
const PROP_REGEX = /(\w+)=(?:{([^}]+)}|"([^"]*)")/g

function parseProps(propString: string): Record<string, any> {
  const props: Record<string, any> = {}
  let match

  while ((match = PROP_REGEX.exec(propString)) !== null) {
    const [, key, jsValue, stringValue] = match
    if (!key) continue
    if (jsValue) {
      try {
        props[key] = JSON.parse(jsValue)
      } catch {
        props[key] = jsValue
      }
    } else if (stringValue !== undefined) {
      props[key] = stringValue
    }
  }

  return props
}

// Extract MDX components from content string
// Returns the list of components and the content with components replaced by placeholders
export function extractMDXComponents(content: string): {
  components: MDXComponent[]
  cleanContent: string
} {
  const components: MDXComponent[] = []
  let cleanContent = content
  let match

  while ((match = COMPONENT_REGEX.exec(content)) !== null) {
    const [fullMatch, tagName1, props1, children, tagName2, props2] = match
    const tagName = tagName1 || tagName2
    if (!tagName) continue
    const propsString = props1 || props2 || ""

    const component: MDXComponent = {
      name: tagName,
      props: parseProps(propsString),
      children: children || undefined,
    }

    components.push(component)

    // Replace the component with a placeholder that we'll convert to TipTap node
    cleanContent = cleanContent.replace(fullMatch, `[COMPONENT:${components.length - 1}]`)
  }

  return { components, cleanContent }
}

// Deserialize MDX string to TipTap JSON
// Handles MDX components, frontmatter, and standard markdown
export function deserializeFromMDX(mdxContent: string, options: MDXDeserializeOptions = {}): any {
  const { componentSchemas = {} } = options

  const { components, cleanContent } = extractMDXComponents(mdxContent)

  const lines = cleanContent.split("\n")
  const content: any[] = []
  let currentParagraph: any = null
  let currentList: any = null
  let currentListType: "bullet" | "ordered" | null = null
  let inCodeBlock = false
  let codeBlockLanguage: string | null = null
  let codeBlockLines: string[] = []
  let currentTable: any = null
  let isHeaderRow = false

  const closeList = () => {
    if (currentList) {
      content.push(currentList)
      currentList = null
      currentListType = null
    }
  }

  const closeParagraph = () => {
    if (currentParagraph) {
      if (currentParagraph.content.length > 0) {
        content.push(currentParagraph)
      }
      currentParagraph = null
    }
  }

  const closeTable = () => {
    if (currentTable) {
      if (currentTable.content.length > 0) {
        content.push(currentTable)
      }
      currentTable = null
      isHeaderRow = false
    }
  }

  const parseTableRow = (line: string): string[] => {
    // Split by | and filter out empty strings at start/end
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0)
    return cells
  }

  const isTableSeparator = (line: string): boolean => {
    // Check if line is a table separator (e.g., |---|---|)
    const trimmed = line.trim()
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      return false
    }
    // Check if it contains mostly dashes and pipes
    const content = trimmed.slice(1, -1)
    return /^[\s\-:]+$/.test(content)
  }

  // Helper function to parse inline markdown (bold, italic, links)
  const parseInlineMarkdown = (text: string): any[] => {
    const textNodes: any[] = []
    if (!text) {
      return [{ type: "text", text: "" }]
    }

    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
    let lastIndex = 0
    let match

    while ((match = linkPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index)
        textNodes.push(...parseBoldItalic(beforeText))
      }

      textNodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "link", attrs: { href: match[2] } }],
      })

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex)
      textNodes.push(...parseBoldItalic(remainingText))
    }

    function parseBoldItalic(segment: string): any[] {
      if (!segment) return []

      const nodes: any[] = []
      const boldPattern = /\*\*([^*]+)\*\*/g
      let lastIdx = 0
      let boldMatch

      while ((boldMatch = boldPattern.exec(segment)) !== null) {
        if (boldMatch.index > lastIdx) {
          const beforeText = segment.substring(lastIdx, boldMatch.index)
          nodes.push(...parseItalic(beforeText))
        }

        nodes.push({
          type: "text",
          text: boldMatch[1],
          marks: [{ type: "bold" }],
        })

        lastIdx = boldMatch.index + boldMatch[0].length
      }

      if (lastIdx < segment.length) {
        const remaining = segment.substring(lastIdx)
        nodes.push(...parseItalic(remaining))
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }]
    }

    function parseItalic(segment: string): any[] {
      if (!segment) return []

      const nodes: any[] = []
      const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g
      let lastIdx = 0
      let italicMatch

      while ((italicMatch = italicPattern.exec(segment)) !== null) {
        if (italicMatch.index > lastIdx) {
          nodes.push({
            type: "text",
            text: segment.substring(lastIdx, italicMatch.index),
          })
        }

        nodes.push({
          type: "text",
          text: italicMatch[1],
          marks: [{ type: "italic" }],
        })

        lastIdx = italicMatch.index + italicMatch[0].length
      }

      if (lastIdx < segment.length) {
        nodes.push({
          type: "text",
          text: segment.substring(lastIdx),
        })
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }]
    }

    return textNodes.length > 0 ? textNodes : [{ type: "text", text: "" }]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    const codeBlockStartMatch = line.match(/^```([\w-]+)?$/)
    if (codeBlockStartMatch) {
      if (inCodeBlock) {
        closeParagraph()
        closeList()

        const codeText = codeBlockLines.join("\n")
        content.push({
          type: "codeBlock",
          attrs: codeBlockLanguage ? { language: codeBlockLanguage } : undefined,
          content: codeText
            ? [
                {
                  type: "text",
                  text: codeText,
                },
              ]
            : [],
        })

        inCodeBlock = false
        codeBlockLanguage = null
        codeBlockLines = []
      } else {
        closeParagraph()
        closeList()
        inCodeBlock = true
        codeBlockLanguage = codeBlockStartMatch[1] || null
        codeBlockLines = []
      }
      continue
    }

    if (inCodeBlock) {
      if (line !== undefined) {
        codeBlockLines.push(line)
      }
      continue
    }

    if (line && line.trim().startsWith("#")) {
      closeParagraph()
      closeList()

      const match = line.match(/^(#+)\s+(.+)$/)
      if (match && match[1] && match[2]) {
        const level = Math.min(match[1].length, 6)
        const text = match[2]
        content.push({
          type: "heading",
          attrs: { level },
          content: text ? parseInlineMarkdown(text) : [],
        })
      }
      continue
    }

    if (line.trim() === "---" || line.trim() === "***") {
      closeParagraph()
      closeList()
      closeTable()
      content.push({
        type: "horizontalRule",
      })
      continue
    }

    // Handle table separator row
    if (line && isTableSeparator(line)) {
      if (currentTable) {
        // Mark that the next row will be data rows (not header)
        isHeaderRow = false
      }
      continue
    }

    // Handle table rows
    if (line && line.trim().startsWith("|") && line.trim().endsWith("|")) {
      closeParagraph()
      closeList()

      const cells = parseTableRow(line)
      if (cells.length === 0) {
        continue
      }

      if (!currentTable) {
        currentTable = {
          type: "table",
          content: [],
        }
        isHeaderRow = true
      }

      const rowCells: any[] = []
      for (const cellText of cells) {
        const cellContent = parseInlineMarkdown(cellText)
        const cellType = isHeaderRow ? "tableHeader" : "tableCell"
        rowCells.push({
          type: cellType,
          content: [
            {
              type: "paragraph",
              content: cellContent.length > 0 ? cellContent : [],
            },
          ],
        })
      }

      currentTable.content.push({
        type: "tableRow",
        content: rowCells,
      })

      continue
    }

    const unorderedMatch = line?.match(/^(\s*)([-*+])\s+(.+)$/)
    if (unorderedMatch && unorderedMatch[3]) {
      closeParagraph()

      const listItemText = unorderedMatch[3]
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      }

      if (currentListType !== "bullet") {
        closeList()
        currentList = {
          type: "bulletList",
          content: [],
        }
        currentListType = "bullet"
      }

      currentList.content.push(listItem)
      continue
    }

    const orderedMatch = line?.match(/^(\s*)(\d+)\.\s+(.+)$/)
    if (orderedMatch && orderedMatch[2] && orderedMatch[3]) {
      closeParagraph()

      const listItemText = orderedMatch[3]
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      }

      if (currentListType !== "ordered") {
        closeList()
        const startNum = parseInt(orderedMatch[2])
        currentList = {
          type: "orderedList",
          attrs: { start: startNum },
          content: [],
        }
        currentListType = "ordered"
      }

      currentList.content.push(listItem)
      continue
    }

    const componentMatch = line?.match(/\[COMPONENT:(\d+)\]/)
    if (componentMatch && componentMatch[1]) {
      closeParagraph()
      closeList()

      const componentIndex = parseInt(componentMatch[1])
      const component = components[componentIndex]

      if (component) {
        const schema = componentSchemas[component.name] || {}

        content.push({
          type: "documentComponent",
          attrs: {
            name: component.name,
            properties: component.props,
            schemas: { [component.name]: schema },
          },
        })
      }
      continue
    }

    if (!line || line.trim() === "") {
      closeParagraph()
      closeList()
      closeTable()
      continue
    }

    closeList()

    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      }
    }

    const textNodes = parseInlineMarkdown(line)
    currentParagraph.content.push(...textNodes)
  }

  closeParagraph()
  closeList()
  closeTable()

  if (inCodeBlock) {
    const codeText = codeBlockLines.join("\n")
    content.push({
      type: "codeBlock",
      attrs: codeBlockLanguage ? { language: codeBlockLanguage } : undefined,
      content: codeText
        ? [
            {
              type: "text",
              text: codeText,
            },
          ]
        : [],
    })
  }

  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [],
    })
  }

  return {
    type: "doc",
    content,
  }
}
