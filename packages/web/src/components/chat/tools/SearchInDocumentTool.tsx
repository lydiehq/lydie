import { Disclosure, DisclosurePanel, Button } from "react-aria-components"
import { ArrowClockwiseRegular, SearchFilled, ChevronRightRegular } from "@fluentui/react-icons"
import { ToolContainer } from "./ToolContainer"

interface SearchResult {
  content: string
  similarity: number
  chunkIndex?: number
  heading?: string
  headingLevel?: number
}

export interface SearchInDocumentToolProps {
  tool: {
    state: string
    args?: {
      query?: string
      documentId?: string
      limit?: number
    }
    output?: {
      message?: string
      state?: string
      documentTitle?: string
      documentId?: string
      query?: string
      resultsCount?: number
      results?: SearchResult[]
      error?: string
    }
  }
  className?: string
}

export function SearchInDocumentTool({ tool, className = "" }: SearchInDocumentToolProps) {
  const isLoading = tool.state === "input-streaming" || tool.state === "call-streaming"
  const hasOutput = tool.state === "output-available"
  const error = tool.output?.error
  const results = tool.output?.results || []
  const query = tool.output?.query || tool.args?.query
  const preliminaryState = tool.output?.state

  if (isLoading) {
    let message = "Reading section"
    const sectionName = query || "section"

    if (preliminaryState === "searching") {
      message = `Searching for "${sectionName}"`
    } else {
      message = `Reading "${sectionName}"`
    }

    return (
      <div className={`flex items-center gap-x-2 text-gray-500 ${className}`}>
        <ArrowClockwiseRegular className="size-3 animate-spin" />
        <span className="text-[13px]">{message}...</span>
      </div>
    )
  }

  if (error) {
    return (
      <ToolContainer title="Read Section" className={className}>
        <div className="text-red-600 text-sm">
          <p className="font-medium">Unable to read section:</p>
          <p className="text-xs mt-1 text-red-500">{error}</p>
        </div>
      </ToolContainer>
    )
  }

  if (!hasOutput || results.length === 0) {
    if (hasOutput && tool.output?.message) {
      // No results found
      return (
        <div className={`flex items-center gap-x-2 text-gray-500 ${className}`}>
          <SearchFilled className="size-3" />
          <span className="text-[13px]">Section not found</span>
        </div>
      )
    }
    return null
  }

  // Show most relevant heading from results
  const topResult = results[0]
  const displayHeading = topResult?.heading || query || "content"

  return (
    <Disclosure className={`group w-full flex flex-col ${className}`}>
      <Button
        className="group flex items-center gap-x-2 truncate relative text-gray-500 hover:text-gray-700"
        slot="trigger"
      >
        <SearchIcon className="size-3 group-hover:opacity-0 transition-opacity duration-200" />
        <ChevronRightRegular className="size-3 opacity-0 group-hover:opacity-100 group-expanded:rotate-90 transition-all duration-200 absolute" />
        <span className="text-[13px]">Read {topResult?.heading ? `"${topResult.heading}"` : "section"}</span>
      </Button>
      <DisclosurePanel className="overflow-hidden pl-5">
        <div className="pt-2">
          <ToolContainer title={displayHeading}>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-3 bg-gray-50">
                  {result.heading && results.length > 1 && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-blue-600">{result.heading}</span>
                    </div>
                  )}
                  <div className="text-sm text-gray-700 leading-relaxed">{result.content}</div>
                </div>
              ))}
            </div>
          </ToolContainer>
        </div>
      </DisclosurePanel>
    </Disclosure>
  )
}
