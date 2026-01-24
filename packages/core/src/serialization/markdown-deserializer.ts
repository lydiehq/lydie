export interface MarkdownDeserializeOptions {}

// Deserialize Markdown string to TipTap JSON
export function deserializeFromMarkdown(markdown: string, options: MarkdownDeserializeOptions = {}): any {
  const lines = markdown.split("\n")
  const content: any[] = []
  let currentParagraph: any = null
  let currentList: any = null
  let currentListType: "bullet" | "ordered" | null = null
  let inCodeBlock = false
  let codeBlockLanguage: string | null = null
  let codeBlockLines: string[] = []

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
      codeBlockLines.push(line)
      continue
    }

    if (line.trim().startsWith("#")) {
      closeParagraph()
      closeList()

      const match = line.match(/^(#+)\s+(.+)$/)
      if (match) {
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

    // Handle horizontal rules (---)
    if (line.trim() === "---" || line.trim() === "***") {
      closeParagraph()
      closeList()
      content.push({
        type: "horizontalRule",
      })
      continue
    }

    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
    if (unorderedMatch) {
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

    // Handle ordered lists (1., 2., etc.)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/)
    if (orderedMatch) {
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

    if (line.trim() === "") {
      closeParagraph()
      closeList()
      continue
    }

    // Handle regular text
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

  // Close any remaining code block
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
