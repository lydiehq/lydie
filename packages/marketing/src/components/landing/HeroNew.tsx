import { BotRegular } from "@fluentui/react-icons";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { Container } from "../Container";
import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";

import styles from "./Hero.module.css";

export function HeroNew() {
  return (
    <div className="relative min-h-[calc(100vh-55px)]">
      <motion.div
        className="absolute inset-px -z-1 mask-radial-closest-side mask-radial-from-20% mask-radial-at-[58%_50%]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 0,0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px, 48px 48px, 100% 100%",
        }}
      />
      {/* <motion.div
        key="assistant-sidebar"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="hidden md:block absolute bottom-8 z-30 right-8 bg-white ring ring-black/8 shadow-2xl rounded-xl w-[420px]"
      >
        <AIAssistantSidebar />
      </motion.div> */}
      <Container className="relative z-20 pointer-events-none overflow-visible">
        <div className="flex min-h-[calc(100vh-55px)] flex-col gap-8 py-8 md:flex-row md:items-center md:gap-10 md:py-0">
          <div className="relative z-30 flex w-full max-w-[400px] flex-col items-start justify-center gap-y-4 py-4 pointer-events-auto md:shrink-0">
            {/* <div className="absolute top-[196px] left-[98px]">
            <div className="grid grid-cols-2 gap-1">
              {[...Array(4)].map((_, index) => (
                <CastShadow strength={0.4}>
                  <div key={index} className="bg-white shadow-surface rounded-lg size-[42px]" />
                </CastShadow>
              ))}
            </div>
          </div> */}
            <h1 className="text-4xl font-medium tracking-tight text-black/85">
              <span className={styles.heroWord1}>Centralize</span>{" "}
              <span className={styles.heroWord2}>your</span>{" "}
              <span className={styles.heroWord3}>writing</span>
            </h1>
            <p className="text-base/relaxed text-black/70 text-balance">
              <span className={styles.heroSentence1}>
                Lydie is a cloud-based writing workspace that adapts to your needs.
              </span>
              <br />
              <span className={styles.heroSentence2}>
                An open-source alternative to Google Docs, Notion and others.
              </span>
            </p>
            <div className="flex md:justify-start justify-center items-center gap-x-1.5 relative w-full py-4 pointer-events-auto">
              <div className={styles.heroButton1}>
                <Button
                  href="https://app.lydie.co/auth"
                  size="lg"
                  intent="primary"
                  phCapture="hero_cta_clicked"
                >
                  <span>Start writing for free</span>
                </Button>
              </div>

              <div className={styles.heroButton2}>
                <Button
                  href="https://github.com/lydiehq/lydie"
                  size="lg"
                  target="_blank"
                  intent="ghost"
                  phCapture="github_clicked"
                >
                  <div className="flex items-center gap-x-1.5">
                    <span>Star on GitHub</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>
          <div className={`w-full pointer-events-auto md:min-w-0 ${styles.heroImage}`}>
            <Application />
          </div>
        </div>
      </Container>
    </div>
  );
}
const documents = [
  "Quick notes",
  "Trip Master Plan",
  "Reading list",
  "Goals 2025",
  "Meeting notes",
  "Japan Trip Planning",
  "Book highlights",
  "Side project ideas",
  "Wishlist",
  "Learning log",
];

export function Application() {
  const newLocal =
    "size-5.5 rounded-md border border-black/10 before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative bg-pink-300";
  return (
    <section className="flex w-full" aria-hidden="true">
      <div className="relative w-full">
        <div className="rounded-2xl ring ring-outline-subtle flex flex-col w-full md:w-[620px] lg:w-[720px] xl:w-[820px] 2xl:w-[920px] p-2 relative bg-[#f9f9f9] select-none ml-auto">
          <div className="flex items-center gap-x-1.5 mb-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-full size-3 ring ring-black/6 shrink-0" />
            ))}
          </div>
          <div className="flex gap-x-2">
            <CastShadow>
              <motion.div
                initial={{ opacity: 0, scale: 1.05, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1, delay: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex-1 h-[360px] sm:h-[460px] md:h-[520px] lg:h-[620px] xl:h-[680px] rounded-b-xl rounded-t-lg bg-[#fcfcfc] shadow-lg ring ring-black/8 relative overflow-hidden"
              >
                <div className="flex h-full min-w-0">
                  <div className="relative flex h-full min-w-0 flex-1">
                    <div className="w-32 sm:w-40 md:w-44 lg:w-52 flex flex-col p-1 relative z-10">
                      <div className="w-full p-1 mb-2">
                        <div className="flex items-center gap-x-2">
                          <div className={newLocal}></div>
                          <span className="text-xs font-medium text-gray-400">My notes</span>
                        </div>
                      </div>
                      {documents.map((title, i) => {
                        const isActive = title === "Japan Trip Planning";
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 1.1, y: 6 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{
                              duration: 0.7,
                              delay: 0.55 + i * 0.08 + 1,
                              ease: [0.25, 0.46, 0.45, 0.94],
                            }}
                            className={`flex items-center gap-x-1.5 py-[5px] px-1.5 hover:bg-black/2 rounded-md truncate min-w-0 ${isActive ? "bg-black/5" : ""}`}
                          >
                            <DocumentThumbnailIcon />
                            <span
                              className={`text-[0.8125rem] select-none truncate ${isActive ? "font-medium text-black/60" : "text-black/60"}`}
                            >
                              {title}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 1.05, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 1.6, delay: 1.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="flex flex-1 overflow-hidden shadow-surface rounded-l-lg rounded-r-md m-1.5 relative bg-white"
                    >
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200">
                          <ToolbarItems />
                        </div>
                        <div className="px-4 py-4 sm:px-8 sm:py-5 lg:px-16 lg:py-6 max-w-[65ch] overflow-hidden grow">
                          <DocumentContent />
                        </div>
                      </div>

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-60 bg-linear-to-b from-transparent to-[#fcfcfc]" />
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </CastShadow>
          </div>
        </div>
      </div>
    </section>
  );
}

type MessageProps = {
  content: string;
};

function DemoUserMessage({ content }: MessageProps) {
  return (
    <div className="flex justify-end">
      <div className="bg-gray-100 max-w-[85%] rounded-2xl rounded-tr-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function DemoAssistantMessage({ content }: MessageProps) {
  return (
    <div className="flex self-start justify-start max-w-[95%] flex-col gap-y-1.5">
      <div className="flex items-center gap-x-1.5">
        <div className="rounded-full size-6 ring ring-outline-subtle flex items-center justify-center bg-white">
          <BotRegular className="size-4 text-black/30" />
        </div>
        <span className="text-[0.8125rem] text-gray-500">Assistant</span>
      </div>
      <div className="flex self-start justify-start max-w-[95%] flex-col gap-y-1.5 pl-7">
        <div className="bg-white ring ring-black/4 rounded-2xl rounded-tl-md px-3 py-2 text-sm text-gray-600 leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
    </div>
  );
}

type StatusItem = {
  id: string;
  loadingText: string;
  completeText: string;
};

const ASSISTANT_SEQUENCE = {
  userMessage: 0,
  searchStart: 0.6,
  searchComplete: 2.0,
  readStart: 2.2,
  readComplete: 4.0,
  foundStart: 4.2,
  foundComplete: 5.5,
  assistantResponse: 6.0,
};

const STATUS_ITEMS: StatusItem[] = [
  {
    id: "search",
    loadingText: 'Searching workspace for "Japan" and "itinerary"...',
    completeText: 'Searched workspace for "Japan" and "itinerary"',
  },
  {
    id: "read",
    loadingText: "Reading documents...",
    completeText: "Read 2 documents",
  },
  {
    id: "found",
    loadingText: "Finding related documents...",
    completeText: "Found: Trip Master Plan",
  },
];

function LoadingSpinner() {
  return (
    <motion.div
      className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-green-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function StatusItemRow({
  item,
  isActive,
  isComplete,
  delay,
}: {
  item: StatusItem;
  isActive: boolean;
  isComplete: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0.4, x: 0 }}
      transition={{
        delay,
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="flex items-center gap-x-2"
    >
      <div className="w-4 h-4 flex items-center justify-center">
        {isComplete ? (
          <CheckIcon />
        ) : isActive ? (
          <LoadingSpinner />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        )}
      </div>
      <span className={`text-sm leading-relaxed ${isComplete ? "text-gray-600" : "text-gray-500"}`}>
        {isComplete ? item.completeText : item.loadingText}
      </span>
    </motion.div>
  );
}

function AIAssistantSidebar() {
  const [animationState, setAnimationState] = React.useState({
    showUserMessage: false,
    showSearch: false,
    searchComplete: false,
    showRead: false,
    readComplete: false,
    showFound: false,
    foundComplete: false,
    showAssistantResponse: false,
  });

  React.useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showUserMessage: true })),
        ASSISTANT_SEQUENCE.userMessage * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showSearch: true })),
        ASSISTANT_SEQUENCE.searchStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, searchComplete: true })),
        ASSISTANT_SEQUENCE.searchComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showRead: true })),
        ASSISTANT_SEQUENCE.readStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, readComplete: true })),
        ASSISTANT_SEQUENCE.readComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showFound: true })),
        ASSISTANT_SEQUENCE.foundStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, foundComplete: true })),
        ASSISTANT_SEQUENCE.foundComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showAssistantResponse: true })),
        ASSISTANT_SEQUENCE.assistantResponse * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col overflow-hidden h-[500px]">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-2">
        <div className="flex flex-col gap-y-5">
          {/* User Message 1 */}
          <AnimatePresence>
            {animationState.showUserMessage && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <DemoUserMessage content="How can we make this itinerary better?" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status Items */}
          <AnimatePresence>
            {(animationState.showSearch || animationState.showRead || animationState.showFound) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-y-2.5 pl-2"
              >
                {STATUS_ITEMS.map((item) => {
                  const isActive =
                    (item.id === "search" && animationState.showSearch) ||
                    (item.id === "read" && animationState.showRead) ||
                    (item.id === "found" && animationState.showFound);
                  const isComplete =
                    (item.id === "search" && animationState.searchComplete) ||
                    (item.id === "read" && animationState.readComplete) ||
                    (item.id === "found" && animationState.foundComplete);
                  const shouldShow = isActive || isComplete;

                  return (
                    shouldShow && (
                      <StatusItemRow
                        key={item.id}
                        item={item}
                        isActive={isActive && !isComplete}
                        isComplete={isComplete}
                        delay={0}
                      />
                    )
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Assistant Response */}
          <AnimatePresence>
            {animationState.showAssistantResponse && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <DemoAssistantMessage
                  content="Based on your Trip Master Plan and other documents, I suggest we add a traditional tea ceremony in Kyoto and include a day trip to Nara to see the deer park. These would complement your existing Tokyo and Osaka plans nicely.
              Would you like me to add these suggestions to your itinerary?"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* <div className="px-2.5 pb-2.5 pt-2 bg-white border-t border-black/6">
        <div className="rounded-xl border border-black/10 shadow-[0_1px_0_0_rgba(255,255,255,0.75)_inset] bg-white px-2 py-1.5">
          <div className="text-sm text-black/35">Ask Lydie Assistant...</div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[0.8125rem] text-black/30">Type a message</div>
            <div className="size-7 rounded-lg bg-black/90 text-white flex items-center justify-center text-xs">
              Send
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
}

import {
  ListFilled,
  TextNumberListLtrFilled,
  TextStrikethroughFilled,
} from "@fluentui/react-icons";
import {
  BlockquoteIcon,
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons";

function ToolbarItems() {
  return (
    <div className="flex items-center">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600 px-1.5">Paragraph</span>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <BoldIcon className="size-[15px]" />
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <ItalicIcon className="size-[15px]" />
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <TextStrikethroughFilled className="size-[15px]" />
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <CodeIcon className="size-[15px]" />
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <BlockquoteIcon className="size-[15px]" />
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <ListFilled className="size-[15px]" />
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <TextNumberListLtrFilled className="size-[15px]" />
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded text-gray-700">
          <LinkIcon className="size-[15px]" />
        </div>
      </div>
    </div>
  );
}

function DocumentContent() {
  return (
    <>
      <h1 className="text-[1.75rem] font-medium text-gray-900 mt-0 mb-4 select-none">
        Japan Trip Planning
      </h1>

      <div className="prose prose-sm editor-content">
        <p className="text-gray-700 leading-relaxed mb-4">
          So excited for our two-week adventure! We should finalize the itinerary and book the
          remaining stays. Sarah will research Tokyo neighborhoods by tomorrow.{" "}
          <em>Check the weather forecast before we pack.</em>
        </p>

        <div className="relative">
          <p className="text-gray-700 leading-relaxed mb-4">
            For must-see spots and hidden gems, we&apos;re building off the recommendations doc.
            I&apos;ll add the restaurant reservations once that&apos;s ready.
          </p>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Things to book</h2>
        <ul className="list-disc pl-6 space-y-1 mb-4 text-gray-700">
          <li>
            <p>
              <strong>JR Pass</strong> - order online by end of week
            </p>
          </li>
          <li>
            <p>Reserve that ryokan in Kyoto with the onsen</p>
          </li>
          <li className="text-gray-700">
            For the full itinerary and daily schedule, see{" "}
            <span className="text-sm font-medium">Trip Master Plan</span>.
          </li>
          <li>
            <p>Book teamLab tickets in advance</p>
          </li>
          <li>
            <p>Confirm Airbnb check-in details for Osaka</p>
          </li>
          <li>
            <p>Look up luggage forwarding service options</p>
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Packing checklist</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          We&apos;ll do a final gear check the night before we leave. Make sure everyone has
          comfortable walking shoes!
        </p>
        <ul className="list-disc pl-6 space-y-1 mb-4 text-gray-700">
          <li>Portable chargers and universal adapters</li>
          <li>Pocket WiFi or SIM cards</li>
          <li>Cash for places that don&apos;t take cards</li>
        </ul>

        <p className="text-gray-700 leading-relaxed mb-0">
          Can&apos;t wait! Drop any other ideas or spots we shouldn&apos;t miss.
        </p>
      </div>
    </>
  );
}
