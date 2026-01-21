import { LoaderIcon, GlobeIcon, ExternalLinkIcon } from "@/icons"
import { motion, AnimatePresence } from "motion/react"

export interface WebSearchToolProps {
	tool: {
		state: string
		toolCallId?: string
		input?: Record<string, any>
		output?: {
			action?: {
				type?: string
				query?: string
			}
			sources?: Array<{
				type?: string
				url?: string
			}>
		}
		providerExecuted?: boolean
	}
	className?: string
}

export function WebSearchTool({ tool }: WebSearchToolProps) {
	const query = tool.output?.action?.query || ""
	const sources = tool.output?.sources || []
	const isToolLoading =
		tool.state === "call-streaming" ||
		tool.state === "input-streaming" ||
		(tool.state === "output-available" && !tool.providerExecuted)

	if (tool.state !== "output-available" && tool.state !== "call-streaming" && !isToolLoading) {
		return null
	}

	const message = isToolLoading
		? query
			? `Searching the web for "${query}"...`
			: "Searching the web..."
		: query
			? `Found ${sources.length} result${sources.length !== 1 ? "s" : ""} for "${query}"`
			: `Found ${sources.length} result${sources.length !== 1 ? "s" : ""}`

	return (
		<motion.div className="p-1 bg-gray-100 rounded-[10px] my-2">
			<div className="p-1">
				<motion.div
					key={isToolLoading ? "loading" : "success"}
					initial={{ opacity: 0, y: -5 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 25,
					}}
					className="text-[11px] text-gray-700"
				>
					{message}
				</motion.div>
			</div>

			<motion.div
				layout="size"
				className="bg-white rounded-lg ring ring-black/2 shadow-surface p-0.5 overflow-hidden"
			>
				<AnimatePresence mode="wait">
					{isToolLoading ? (
						<motion.div
							key="spinner"
							className="flex items-center justify-center py-2"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						>
							<LoaderIcon className="size-4 animate-spin text-gray-400" />
						</motion.div>
					) : sources.length > 0 ? (
						<motion.ul
							initial="hidden"
							animate="visible"
							transition={{ duration: 0.5, delay: 0.1 }}
							variants={{
								hidden: { opacity: 0 },
								visible: {
									opacity: 1,
									transition: {
										staggerChildren: Math.max(
											0.02,
											Math.min(0.08, 0.08 - (sources.length - 1) * 0.005),
										),
									},
								},
							}}
							className="space-y-0.5"
						>
							{sources.map((source, index) => (
								<motion.li
									key={source.url || index}
									variants={{
										hidden: { opacity: 0, y: 10 },
										visible: {
											opacity: 1,
											y: 0,
										},
									}}
									transition={{ duration: 0.4, ease: "easeOut" }}
								>
									<a
										href={source.url}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-x-1.5 py-1.5 rounded-md text-sm px-2 text-gray-600 hover:bg-black/3 transition-colors duration-75"
									>
										<GlobeIcon className="text-gray-500 shrink-0 size-3.5" />
										<span className="truncate flex-1 text-[13px]">
											{source.url || "Unknown source"}
										</span>
										<ExternalLinkIcon className="text-gray-400 shrink-0 size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
									</a>
								</motion.li>
							))}
						</motion.ul>
					) : (
						<motion.div
							key="empty"
							className="flex items-center justify-center py-3 text-gray-500"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
							<span className="text-[13px]">No results found</span>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</motion.div>
	)
}
