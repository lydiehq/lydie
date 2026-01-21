import React, { useState, useEffect, useCallback, useRef } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Container } from "../Container"
import {
  analyzeReadability,
  findReadabilityIssues,
  type ReadabilityResult,
  type ReadabilityIssue,
} from "./readability-utils"
import { ReadabilityHighlight } from "./readability-highlight"
import { Eye, Trash2, Info } from "lucide-react"

export function ReadabilityAnalyzer() {
  const [result, setResult] = useState<ReadabilityResult | null>(null)
  const [issues, setIssues] = useState<ReadabilityIssue[]>([])
  const [selectedIssue, setSelectedIssue] = useState<ReadabilityIssue | null>(null)
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, ReadabilityHighlight],
    content: "",
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[400px] p-6 text-base leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText()
      if (text.trim()) {
        const analysis = analyzeReadability(text)
        setResult(analysis)

        // Debounce highlighting updates
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current)
        }
        highlightTimeoutRef.current = setTimeout(() => {
          updateHighlights(editor, text)
        }, 300)
      } else {
        setResult(null)
        setIssues([])
        // Clear all highlights
        editor.commands.unsetReadabilityHighlight()
      }
    },
  })

  const updateHighlights = useCallback((editorInstance: Editor, text: string) => {
    if (!editorInstance) return

    // Find all issues
    const foundIssues = findReadabilityIssues(text)
    setIssues(foundIssues)

    // Get the current document
    const { state } = editorInstance
    const markType = state.schema.marks.readabilityHighlight
    if (!markType) return

    // Create a new transaction
    const tr = state.tr

    // First, remove all existing readability highlights from the entire document
    tr.removeMark(0, state.doc.content.size, markType)

    // Convert text positions to document positions
    const docText = editorInstance.getText()
    let textPos = 0
    const positionMap: Array<{
      textStart: number
      textEnd: number
      docStart: number
      docEnd: number
    }> = []

    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const nodeStart = textPos
        const nodeEnd = textPos + node.text.length
        positionMap.push({
          textStart: nodeStart,
          textEnd: nodeEnd,
          docStart: pos,
          docEnd: pos + node.nodeSize,
        })
        textPos = nodeEnd
      }
    })

    // Apply new highlights
    foundIssues.forEach((issue) => {
      // Find document positions for this issue
      let docFrom: number | null = null
      let docTo: number | null = null

      for (const map of positionMap) {
        // Check if issue starts in this text node
        if (issue.start >= map.textStart && issue.start < map.textEnd && docFrom === null) {
          const offset = issue.start - map.textStart
          docFrom = map.docStart + offset
        }
        // Check if issue ends in this text node
        if (issue.end > map.textStart && issue.end <= map.textEnd && docTo === null) {
          const offset = issue.end - map.textStart
          docTo = map.docStart + offset
        }

        // If we found both positions, we're done
        if (docFrom !== null && docTo !== null) break
      }

      if (docFrom !== null && docTo !== null && docTo > docFrom) {
        tr.addMark(
          docFrom,
          docTo,
          markType.create({
            type: issue.type,
            severity: issue.severity,
          }),
        )
      }
    })

    // Dispatch the transaction
    editorInstance.view.dispatch(tr)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const clearText = () => {
    if (editor) {
      editor.commands.clearContent()
      setResult(null)
      setIssues([])
      setSelectedIssue(null)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600"
    if (score >= 50) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return "bg-green-50 border-green-200"
    if (score >= 50) return "bg-yellow-50 border-yellow-200"
    return "bg-red-50 border-red-200"
  }

  const getIssueCounts = () => {
    const veryHard = issues.filter((i) => i.type === "very-long-sentence").length
    const hard = issues.filter((i) => i.type === "long-sentence").length
    const adverbs = issues.filter((i) => i.type === "adverb").length
    const passive = issues.filter((i) => i.type === "passive-voice").length
    const complex = issues.filter((i) => i.type === "complex-word").length

    return { veryHard, hard, adverbs, passive, complex }
  }

  const issueCounts = getIssueCounts()
  const totalIssues = issues.length

  return (
    <Container className="py-12 max-w-7xl">
      <div className="space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-heading font-bold text-gray-900">Readability Analyzer</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Analyze your text's readability with real-time highlighting. Get instant feedback on long
            sentences, adverbs, passive voice, and complex words.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Editor Area */}
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="editor" className="block text-sm font-medium text-gray-700">
                  Enter your text
                </label>
                <button
                  onClick={clearText}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove current text
                </button>
              </div>
              <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                <EditorContent editor={editor} />
              </div>
              {editor && <p className="text-sm text-gray-500">{editor.getText().length} characters</p>}
            </div>

            {/* Issue Popover */}
            {selectedIssue && (
              <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">Readability issue</h3>
                  <button
                    onClick={() => setSelectedIssue(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-700 mb-3">
                  {selectedIssue.suggestion || "Consider improving this text."}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={`px-2 py-1 rounded ${
                      selectedIssue.severity === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {selectedIssue.type.replace(/-/g, " ")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Readability Score */}
            {result && (
              <div className={`p-6 rounded-lg border-2 ${getScoreBgColor(result.fleschKincaid.score)}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Readability checker</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-bold text-gray-900">
                        Grade{" "}
                        {Math.round(parseFloat(result.fleschKincaid.gradeLevel.match(/\d+/)?.[0] || "0"))}
                      </span>
                      <Info className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${getScoreColor(result.fleschKincaid.score)}`}>
                    {result.fleschKincaid.score}
                  </div>
                </div>
                <div className="text-sm text-gray-600">{result.fleschKincaid.readabilityLevel}</div>
              </div>
            )}

            {/* Issue Counts */}
            {result && totalIssues > 0 && (
              <div className="space-y-3">
                {issueCounts.veryHard > 0 && (
                  <div
                    className="p-4 bg-red-50 border border-red-200 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                    onClick={() => {
                      const issue = issues.find((i) => i.type === "very-long-sentence")
                      if (issue) setSelectedIssue(issue)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-red-900">
                        {issueCounts.veryHard} of {result.sentenceCount} sentences is very hard to read.
                      </span>
                      <Eye className="w-4 h-4 text-red-600" />
                    </div>
                  </div>
                )}

                {issueCounts.hard > 0 && (
                  <div
                    className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors"
                    onClick={() => {
                      const issue = issues.find((i) => i.type === "long-sentence")
                      if (issue) setSelectedIssue(issue)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-yellow-900">
                        {issueCounts.hard} of {result.sentenceCount} sentences is hard to read.
                      </span>
                      <Eye className="w-4 h-4 text-yellow-600" />
                    </div>
                  </div>
                )}

                {issueCounts.adverbs > 0 && (
                  <div
                    className="p-4 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => {
                      const issue = issues.find((i) => i.type === "adverb")
                      if (issue) setSelectedIssue(issue)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-900">
                        {issueCounts.adverbs} adverb
                        {issueCounts.adverbs !== 1 ? "s" : ""} found.
                      </span>
                      <Eye className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                )}

                {issueCounts.passive > 0 && (
                  <div
                    className="p-4 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => {
                      const issue = issues.find((i) => i.type === "passive-voice")
                      if (issue) setSelectedIssue(issue)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-900">
                        {issueCounts.passive} passive voice instance
                        {issueCounts.passive !== 1 ? "s" : ""} found.
                      </span>
                      <Eye className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                )}

                {issueCounts.complex > 0 && (
                  <div
                    className="p-4 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors"
                    onClick={() => {
                      const issue = issues.find((i) => i.type === "complex-word")
                      if (issue) setSelectedIssue(issue)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-purple-900">
                        {issueCounts.complex} complex word
                        {issueCounts.complex !== 1 ? "s" : ""} found.
                      </span>
                      <Eye className="w-4 h-4 text-purple-600" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Statistics */}
            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xl font-bold text-gray-900">{result.wordCount.toLocaleString()}</div>
                    <div className="text-xs text-gray-600 mt-1">Words</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xl font-bold text-gray-900">{result.sentenceCount}</div>
                    <div className="text-xs text-gray-600 mt-1">Sentences</div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 font-medium">Reading Time:</span>
                    <span className="text-lg font-bold text-blue-900">
                      {result.readingTime.minutes > 0
                        ? `${result.readingTime.minutes} min ${
                            result.readingTime.seconds > 0 ? `${result.readingTime.seconds} sec` : ""
                          }`
                        : `${result.readingTime.seconds} sec`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  )
}
