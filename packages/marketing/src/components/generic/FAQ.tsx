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

/**
 * Parses markdown-style links [text](url) and line breaks in text
 * Returns an array of React nodes
 */
function renderRichText(text: string): React.ReactNode[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link (with line breaks)
    if (match.index > lastIndex) {
      parts.push(...renderTextWithLineBreaks(text.slice(lastIndex, match.index)));
    }

    // Add the link
    parts.push(
      <a
        key={`link-${match.index}`}
        href={match[2]}
        className="underline text-black/85 hover:text-black focus:outline-none focus:underline"
      >
        {match[1]}
      </a>,
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (with line breaks)
  if (lastIndex < text.length) {
    parts.push(...renderTextWithLineBreaks(text.slice(lastIndex)));
  }

  return parts;
}

/**
 * Splits text by newlines and returns an array of fragments with <br /> tags
 */
function renderTextWithLineBreaks(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    result.push(line);
    if (index < lines.length - 1) {
      result.push(<br key={`br-${index}`} />);
    }
  });

  return result;
}

export interface FAQItem {
  /** The question text */
  question: string;
  /** The answer text (supports markdown-style links [text](url) and line breaks) */
  answer: string;
}

/** Legacy format used in some data files */
export interface LegacyFAQItem {
  q: string;
  a: string;
}

interface FAQProps {
  title?: string;
  items: (FAQItem | LegacyFAQItem)[];
  className?: string;
}

function normalizeFAQItem(item: FAQItem | LegacyFAQItem): FAQItem {
  if ("q" in item && "a" in item) {
    return { question: item.q, answer: item.a };
  }
  return item as FAQItem;
}

export function FAQ({ title = "Frequently Asked Questions", items }: FAQProps) {
  const normalizedItems = items.map(normalizeFAQItem);

  return (
    <div className="gap-y-6 flex flex-col w-full">
      <h2 className="text-lg font-medium text-black/85">{title}</h2>
      <div>
        {normalizedItems.map((item, index) => (
          <FAQItemComponent
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

interface FAQItemComponentProps {
  question: string;
  answer: string;
  isLast?: boolean;
}

const MotionDisclosurePanel = motion.create(DisclosurePanel);

function FAQItemComponent({ question, answer }: FAQItemComponentProps) {
  const renderedAnswer = renderRichText(answer);

  return (
    <Disclosure className="border-b border-black/6 last:border-b-0">
      {({ isExpanded }) => (
        <>
          <Heading className="py-2">
            <Button
              slot="trigger"
              className="relative w-full flex items-center justify-between gap-4 py-1.5 text-left after:pointer-events-none after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-lg after:bg-transparent after:content-[''] hover:after:bg-black/3 after:transition-colors after:duration-100 after:-z-10"
            >
              <span className="text-[0.9375rem] font-medium text-black/75">{question}</span>
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
                  {renderedAnswer}
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
