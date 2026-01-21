import React, { useContext } from "react"
import { Disclosure, DisclosurePanel, Heading, Button, DisclosureStateContext } from "react-aria-components"
import { ChevronRight } from "lucide-react"

export interface FAQItem {
	question: string
	answer: React.ReactNode
}

interface FAQProps {
	title?: string
	items: FAQItem[]
	className?: string
}

export function FAQ({ title = "Frequently Asked Questions", items, className }: FAQProps) {
	return (
		<div className={`max-w-3xl mx-auto mt-12 ${className || ""}`}>
			<h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>
			<div className="space-y-2">
				{items.map((item, index) => (
					<FAQItem
						key={index}
						question={item.question}
						answer={item.answer}
						isLast={index === items.length - 1}
					/>
				))}
			</div>
		</div>
	)
}

interface FAQItemProps {
	question: string
	answer: React.ReactNode
	isLast?: boolean
}

function FAQItem({ question, answer, isLast }: FAQItemProps) {
	return (
		<Disclosure className="border-b border-gray-200 last:border-b-0" defaultExpanded={false}>
			<Heading>
				<Button
					slot="trigger"
					className="w-full flex items-center justify-between gap-4 py-6 text-left"
				>
					<span className="text-lg font-semibold text-gray-900 pr-4">{question}</span>
					<ChevronIcon />
				</Button>
			</Heading>
			<DisclosurePanel className="pb-6 text-gray-700">{answer}</DisclosurePanel>
		</Disclosure>
	)
}

function ChevronIcon() {
	const { isExpanded } = useContext(DisclosureStateContext)!
	return (
		<ChevronRight
			className={`w-5 h-5 text-gray-600 shrink-0 transition-transform duration-200 ${
				isExpanded ? "rotate-90" : ""
			}`}
			aria-hidden="true"
		/>
	)
}
