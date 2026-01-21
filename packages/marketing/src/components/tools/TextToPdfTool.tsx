import React, { useState } from "react"
import { TipTapEditor } from "../generic/TipTapEditor"
import { Container } from "../Container"
import { Button } from "../generic/Button"
import { Trash2, Download, FileText } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { ToolHeader } from "./ToolHeader"

export function TextToPdfTool() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isGenerating, setIsGenerating] = useState(false)

	const handleUpdate = (editorInstance: Editor) => {
		setEditor(editorInstance)
	}

	const clearText = () => {
		if (editor) {
			editor.commands.clearContent()
		}
	}

	const generatePdf = async () => {
		if (!editor || isGenerating) return

		setIsGenerating(true)
		try {
			// Dynamically import jspdf and html2canvas
			const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
				import("jspdf"),
				import("html2canvas-pro"),
			])

			// Get the editor content element from the editor instance
			const editorElement = editor.view.dom as HTMLElement

			if (!editorElement) {
				throw new Error("Editor content not found")
			}

			// Create a temporary container with better styling for PDF
			const tempContainer = document.createElement("div")
			tempContainer.style.position = "absolute"
			tempContainer.style.left = "-9999px"
			tempContainer.style.width = "210mm" // A4 width
			tempContainer.style.padding = "20mm"
			tempContainer.style.fontFamily = "system-ui, -apple-system, sans-serif"
			tempContainer.style.fontSize = "12pt"
			tempContainer.style.lineHeight = "1.6"
			tempContainer.style.color = "#000"
			tempContainer.style.backgroundColor = "#fff"

			// Clone the editor content
			const clonedContent = editorElement.cloneNode(true) as HTMLElement

			// Clean up the cloned content for better PDF rendering
			clonedContent.style.width = "100%"
			clonedContent.style.maxWidth = "none"
			clonedContent.style.margin = "0"
			clonedContent.style.padding = "0"

			tempContainer.appendChild(clonedContent)
			document.body.appendChild(tempContainer)

			// Convert to canvas
			const canvas = await html2canvas(tempContainer, {
				scale: 2,
				useCORS: true,
				logging: false,
				backgroundColor: "#ffffff",
			})

			// Clean up
			document.body.removeChild(tempContainer)

			// Create PDF
			const pdf = new jsPDF({
				orientation: "portrait",
				unit: "mm",
				format: "a4",
			})

			const imgData = canvas.toDataURL("image/png")
			const imgWidth = 210 // A4 width in mm
			const pageHeight = 297 // A4 height in mm
			const imgHeight = (canvas.height * imgWidth) / canvas.width
			let heightLeft = imgHeight
			let position = 0

			// Add first page
			pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
			heightLeft -= pageHeight

			// Add additional pages if needed
			while (heightLeft > 0) {
				position = heightLeft - imgHeight
				pdf.addPage()
				pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
				heightLeft -= pageHeight
			}

			// Save the PDF
			pdf.save("document.pdf")
		} catch (error) {
			console.error("Error generating PDF:", error)
			alert("Failed to generate PDF. Please try again.")
		} finally {
			setIsGenerating(false)
		}
	}

	return (
		<Container>
			<div className="space-y-8">
				<ToolHeader
					title="Text to PDF"
					description="Convert your text to a PDF document. Simply type or paste your content and download it as a PDF file."
				/>
				<div className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label htmlFor="editor" className="block text-sm font-medium text-gray-700">
								Enter your text
							</label>
							<div className="flex items-center gap-2">
								<Button
									onPress={clearText}
									intent="ghost"
									size="sm"
									className="flex items-center gap-2"
									isDisabled={!editor || editor.isEmpty}
								>
									<Trash2 className="w-4 h-4" />
									Clear
								</Button>
								<Button
									onPress={generatePdf}
									intent="primary"
									size="sm"
									className="flex items-center gap-2"
									isDisabled={!editor || editor.isEmpty || isGenerating}
								>
									{isGenerating ? (
										<>
											<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
											Generating...
										</>
									) : (
										<>
											<Download className="w-4 h-4" />
											Download PDF
										</>
									)}
								</Button>
							</div>
						</div>
						<TipTapEditor
							onUpdate={handleUpdate}
							placeholder="Start typing or paste your text here. When you're ready, click 'Download PDF' to convert it to a PDF file."
							minHeight="500px"
							showToolbar={true}
						/>
					</div>

					{/* Info Section */}
					<div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
						<div className="flex items-start gap-3">
							<FileText className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
							<div className="space-y-2">
								<h3 className="text-sm font-semibold text-gray-900">How it works</h3>
								<p className="text-sm text-gray-600">
									Type or paste your text into the editor above. The tool supports basic
									formatting like headings, bold, italic, and lists. When you're ready,
									click the "Download PDF" button to generate and download your document as
									a PDF file.
								</p>
							</div>
						</div>
					</div>
				</div>
				<div
					className="prose max-w-3xl mx-auto"
					dangerouslySetInnerHTML={{
						__html: `
              <p>This free text-to-PDF converter lets you quickly turn any text into a PDF document. Whether you're writing a report, creating a document, or need to save text in PDF format, this tool makes it easy.</p>
              <p>Simply type or paste your content into the editor, format it as needed, and click the download button. Your PDF will be ready in seconds — no sign-up required, no watermarks, completely free.</p>
              <p><strong>You can use it to:</strong></p>
              <ul>
                <li>Convert text documents to PDF format</li>
                <li>Create PDFs from notes or drafts</li>
                <li>Save formatted text as PDF files</li>
                <li>Generate PDF documents for sharing or printing</li>
              </ul>
              <p>All processing happens in your browser — your content never leaves your device, ensuring privacy and security.</p>
            `,
					}}
				/>
			</div>
		</Container>
	)
}
