import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import { AnimatePresence, motion } from "motion/react";
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

export function FAQ({ items }: FAQProps) {
  return (
    <div className="gap-y-2 flex flex-col">
      <h2 className="text-lg font-medium text-black/85">Frequently Asked Questions</h2>
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

// Create Motion wrapper for React Aria DisclosurePanel
const MotionDisclosurePanel = motion.create(DisclosurePanel);

function FAQItem({ question, answer }: FAQItemProps) {
  return (
    <Disclosure className="border-b border-black/6 last:border-b-0">
      {({ isExpanded }) => (
        <>
          <Heading className="mb-2">
            <Button
              slot="trigger"
              className="relative w-full flex items-center justify-between gap-4 py-1.5 text-left after:pointer-events-none after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-lg after:bg-transparent after:content-[''] hover:after:bg-black/3 after:transition-colors after:duration-100 after:-z-10"
            >
              <span className="text-[0.9375rem] font-medium text-black/85 pr-4">{question}</span>
              <ChevronIcon />
            </Button>
          </Heading>
          <AnimatePresence initial={false}>
            {isExpanded && (
              <MotionDisclosurePanel
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="text-[0.9375rem]/relaxed text-black/70"
              >
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
                  className="pb-4 max-w-[65ch]"
                >
                  {answer}
                </motion.div>
              </MotionDisclosurePanel>
            )}
          </AnimatePresence>
        </>
      )}
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
