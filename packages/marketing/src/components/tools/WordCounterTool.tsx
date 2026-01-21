import React, { useState } from "react"
import { TipTapEditor } from "../generic/TipTapEditor"
import { Container } from "../Container"
import { Button } from "../generic/Button"
import { FAQ, type FAQItem } from "../generic/FAQ"
import { Trash2, MessageSquare, Cloud, Image, Hash, Briefcase } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { ToolHeader } from "./ToolHeader"
import type { LucideIcon } from "lucide-react"

interface WordCountStats {
	words: number
	characters: number
	charactersNoSpaces: number
	paragraphs: number
	sentences: number
}

interface PlatformLimit {
	name: string
	limit: number
	color: string
	icon: LucideIcon
}

const PLATFORM_LIMITS: PlatformLimit[] = [
	{ name: "Twitter/X", limit: 280, color: "bg-blue-500", icon: MessageSquare },
	{ name: "Bluesky", limit: 300, color: "bg-sky-500", icon: Cloud },
	{ name: "Pinterest", limit: 500, color: "bg-red-500", icon: Image },
	{ name: "Threads", limit: 500, color: "bg-gray-900", icon: Hash },
	{ name: "LinkedIn", limit: 3000, color: "bg-blue-600", icon: Briefcase },
]

function countWords(text: string): WordCountStats {
	const trimmed = text.trim()

	if (!trimmed) {
		return {
			words: 0,
			characters: 0,
			charactersNoSpaces: 0,
			paragraphs: 0,
			sentences: 0,
		}
	}

	// Count words (split by whitespace and filter empty strings)
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0)

	// Count characters
	const characters = text.length
	const charactersNoSpaces = text.replace(/\s/g, "").length

	// Count paragraphs (split by double newlines or single newline if followed by content)
	const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1

	// Count sentences (split by sentence-ending punctuation)
	const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length

	return {
		words: words.length,
		characters,
		charactersNoSpaces,
		paragraphs,
		sentences,
	}
}

const FAQ_ITEMS: FAQItem[] = [
	{
		question: "What are the character limits for different social media platforms?",
		answer: (
			<div className="space-y-2">
				<p>Different platforms have different character limits for posts:</p>
				<ul className="list-disc list-inside space-y-1 ml-4">
					<li>
						<strong>Twitter/X:</strong> 280 characters per tweet
					</li>
					<li>
						<strong>Bluesky:</strong> 300 characters per post
					</li>
					<li>
						<strong>Pinterest:</strong> 500 characters per pin description
					</li>
					<li>
						<strong>Threads:</strong> 500 characters per thread
					</li>
					<li>
						<strong>LinkedIn:</strong> 3,000 characters per post
					</li>
				</ul>
				<p className="mt-2">
					These limits help platforms maintain concise, readable content and ensure a consistent
					user experience.
				</p>
			</div>
		),
	},
	{
		question: "Why do social media platforms have character limits?",
		answer: (
			<p>
				Character limits serve several purposes: they encourage concise, engaging content that's
				easier to read and digest, help maintain platform performance by limiting data transfer, and
				create a consistent user experience. They also make content more scannable on mobile devices,
				where most social media is consumed.
			</p>
		),
	},
	{
		question: "What happens if I exceed the character limit?",
		answer: (
			<p>
				If you exceed a platform's character limit, you typically won't be able to post your content
				until you shorten it. Some platforms may truncate your text automatically, which can cut off
				important information. It's best to stay within the limit to ensure your full message is
				visible to your audience.
			</p>
		),
	},
	{
		question: "Are character limits the same for all post types on a platform?",
		answer: (
			<p>
				No, character limits can vary by post type. For example, on Twitter/X, regular tweets have a
				280-character limit, but replies and direct messages may have different limits. LinkedIn posts
				allow 3,000 characters, but comments have a shorter limit. Always check the specific limits
				for the type of content you're creating.
			</p>
		),
	},
	{
		question: "How can I stay within character limits?",
		answer: (
			<div className="space-y-2">
				<p>Here are some tips to keep your content within limits:</p>
				<ul className="list-disc list-inside space-y-1 ml-4">
					<li>Use abbreviations where appropriate (e.g., "&" instead of "and")</li>
					<li>Remove unnecessary words and filler phrases</li>
					<li>Use shorter synonyms when possible</li>
					<li>Break long posts into multiple shorter posts or threads</li>
					<li>Use our word counter tool to track your character count in real-time</li>
				</ul>
			</div>
		),
	},
	{
		question: "Do character limits include spaces and punctuation?",
		answer: (
			<p>
				Yes, character limits typically include all characters: letters, numbers, spaces, punctuation
				marks, emojis, and special characters. Some platforms count emojis differently (they may count
				as multiple characters), but generally, every character you type counts toward the limit. Our
				word counter shows both total characters (with spaces) and characters without spaces to help
				you understand your text length.
			</p>
		),
	},
]

export function WordCounterTool() {
	const [stats, setStats] = useState<WordCountStats>({
		words: 0,
		characters: 0,
		charactersNoSpaces: 0,
		paragraphs: 0,
		sentences: 0,
	})
	const [editor, setEditor] = useState<Editor | null>(null)

	const handleUpdate = (editorInstance: Editor) => {
		setEditor(editorInstance)
		const text = editorInstance.getText()
		const newStats = countWords(text)
		setStats(newStats)
	}

	const clearText = () => {
		if (editor) {
			editor.commands.clearContent()
			setStats({
				words: 0,
				characters: 0,
				charactersNoSpaces: 0,
				paragraphs: 0,
				sentences: 0,
			})
		}
	}

	return (
		<Container className="pt-8 md:pt-12">
			<div className="flex flex-col gap-y-8">
				<ToolHeader
					title="Word Counter"
					description="Count words, characters, sentences, and paragraphs in your text in real-time."
				/>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2 space-y-4">
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Button
									onPress={clearText}
									intent="ghost"
									size="sm"
									className="flex items-center gap-2"
								>
									<Trash2 className="w-4 h-4" />
									Clear
								</Button>
							</div>
							<div className="bg-gray-100 rounded-lg ring ring-black/4 p-1">
								<TipTapEditor
									onUpdate={handleUpdate}
									placeholder="Start typing or paste your text here..."
									minHeight="400px"
								/>
							</div>
						</div>

						{/* Platform Guidelines */}
						<PlatformGuidelines stats={stats} />
					</div>

					{/* Statistics Sidebar */}
					<div className="space-y-4">
						<div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
							<h2 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h2>
							<div className="space-y-4">
								<div className="p-4 bg-white rounded-lg border border-gray-200">
									<div className="text-3xl font-bold text-gray-900">
										{stats.words.toLocaleString()}
									</div>
									<div className="text-sm text-gray-600 mt-1">Words</div>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="p-3 bg-white rounded-lg border border-gray-200">
										<div className="text-xl font-bold text-gray-900">
											{stats.characters.toLocaleString()}
										</div>
										<div className="text-xs text-gray-600 mt-1">Characters</div>
									</div>
									<div className="p-3 bg-white rounded-lg border border-gray-200">
										<div className="text-xl font-bold text-gray-900">
											{stats.charactersNoSpaces.toLocaleString()}
										</div>
										<div className="text-xs text-gray-600 mt-1">No spaces</div>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="p-3 bg-white rounded-lg border border-gray-200">
										<div className="text-xl font-bold text-gray-900">
											{stats.sentences}
										</div>
										<div className="text-xs text-gray-600 mt-1">Sentences</div>
									</div>
									<div className="p-3 bg-white rounded-lg border border-gray-200">
										<div className="text-xl font-bold text-gray-900">
											{stats.paragraphs}
										</div>
										<div className="text-xs text-gray-600 mt-1">Paragraphs</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div
					className="prose max-w-3xl mx-auto"
					dangerouslySetInnerHTML={{
						__html: `
              <p>This simple word counter lets you see how many words and characters are in your text. It updates as you type or paste, so you can quickly check the length of anything you're writing — from an essay or article to a tweet or blog post.</p>
              <p>Writers, students, and editors often need to keep track of word limits or make sure a piece fits within certain guidelines. This tool gives you a clear count without distractions — no ads, no sign-up, just the numbers you need.</p>
              <p><strong>You can use it to:</strong></p>
              <ul>
                <li>Check word and character count for assignments or reports</li>
                <li>Edit text for SEO or readability</li>
                <li>See how long your meta descriptions, headlines, or emails are</li>
              </ul>
              <p>It's a small, practical tool built to do one thing well — help you know exactly how long your writing is.</p>
            `,
					}}
				/>

				{/* FAQ Section */}
				<FAQ items={FAQ_ITEMS} />
			</div>
		</Container>
	)
}

interface PlatformGuidelinesProps {
	stats: WordCountStats
}

function PlatformGuidelines({ stats }: PlatformGuidelinesProps) {
	return (
		<div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
			<h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Guidelines</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
				{PLATFORM_LIMITS.map((platform) => {
					const percentage = Math.min((stats.characters / platform.limit) * 100, 100)
					const isOverLimit = stats.characters > platform.limit
					const Icon = platform.icon

					return (
						<div key={platform.name} className="space-y-2">
							<div className="flex items-center gap-2 mb-2">
								<Icon className="w-4 h-4 text-gray-600" />
								<span className="text-sm font-medium text-gray-700">{platform.name}</span>
							</div>
							<div className="text-xs text-gray-600 mb-1">
								<span
									className={`font-medium ${
										isOverLimit
											? "text-red-600"
											: percentage > 80
												? "text-yellow-600"
												: "text-gray-600"
									}`}
								>
									{stats.characters.toLocaleString()} / {platform.limit.toLocaleString()}
								</span>
							</div>
							<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
								<div
									className={`h-full transition-all duration-300 rounded-full ${
										isOverLimit
											? "bg-red-500"
											: percentage > 80
												? "bg-yellow-500"
												: platform.color
									}`}
									style={{ width: `${Math.min(percentage, 100)}%` }}
								/>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
