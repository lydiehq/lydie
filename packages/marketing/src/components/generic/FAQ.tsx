import { ChevronRightRegular } from "@fluentui/react-icons";
import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import React, { useContext } from "react";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureStateContext,
  Heading,
} from "react-aria-components";

export interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface FAQProps {
  title?: string;
  items: FAQItem[];
  className?: string;
}

export function FAQ({ title = "Frequently Asked Questions", items, className }: FAQProps) {
  return (
    <div className={className}>
      <h2 className="text-lg font-medium text-black/85">{title}</h2>
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
  );
}

interface FAQItemProps {
  question: string;
  answer: React.ReactNode;
  isLast?: boolean;
}

function FAQItem({ question, answer }: FAQItemProps) {
  return (
    <Disclosure className="border-b border-black/6 last:border-b-0">
      <Heading>
        <Button
          slot="trigger"
          className="relative w-full flex items-center justify-between gap-4 py-2 text-left after:pointer-events-none after:absolute after:inset-y-0 after:-inset-x-3 after:rounded-lg after:bg-transparent after:content-[''] hover:after:bg-black/4 after:transition-colors after:duration-100 after:-z-10"
        >
          <span className="text-base font-medium text-black/85 pr-4">{question}</span>
          <ChevronIcon />
        </Button>
      </Heading>
      <DisclosurePanel className="text-[0.875rem]/relaxed pb-4 text-black/80">
        {answer}
      </DisclosurePanel>
    </Disclosure>
  );
}

function ChevronIcon() {
  const { isExpanded } = useContext(DisclosureStateContext)!;
  return (
    <CollapseArrow
      className={`size-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${
        isExpanded ? "rotate-90" : "-rotate-90"
      }`}
      aria-hidden="true"
    />
  );
}
