import { BotRegular } from "@fluentui/react-icons";
import { getColorById } from "@lydie/core/colors";
import { CollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import type { DemoState } from "./DemoStateSelector";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { CommandMenuIllustration, type CommandMenuSection } from "./CommandMenuIllustration";
import { STATE_CONFIG, DEFAULT_STATE_ORDER } from "./DemoStateSelector";

const collaborators = [
  { name: "Sarah", color: getColorById("cyan")?.value ?? "#7DBCD6" },
  { name: "Alex", color: getColorById("green")?.value ?? "#90C9AA" },
  { name: "Jordan", color: getColorById("gold")?.value ?? "#E8B974" },
];

type ComposableDemoProps = {
  activeState: DemoState;
  states?: DemoState[];
};

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

export function ComposableDemo({ activeState }: ComposableDemoProps) {
  const newLocal =
    "size-5.5 rounded-md border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative bg-pink-300";
  return (
    <section className="flex flex-col items-center overflow-visible w-full" aria-hidden="true">
      <div className="relative size-full p-1.5 -m-1.5">
        <GradientOutline />
        <div className="rounded-2xl ring ring-outline-subtle flex flex-col w-full p-2 relative bg-[#f9f9f9] select-none">
          <div className="flex items-center gap-x-1.5 mb-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-full size-3 ring ring-black/6 shrink-0" />
            ))}
          </div>
          <div className="flex gap-x-2">
            <CastShadow className="w-full rounded-b-xl rounded-t-lg">
              <div className="flex overflow-hidden flex-1 h-[580px] rounded-b-xl rounded-t-lg bg-white shadow-xl ring ring-black/8 relative">
                <motion.div
                  className="flex flex-1 min-w-0"
                  animate={{
                    opacity: activeState === "assistant" ? 0.65 : 1,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 35,
                  }}
                >
                  <motion.div
                    className=""
                    animate={{
                      width: activeState === "assistant" ? 0 : "auto",
                    }}
                  >
                    <div className="w-52 flex flex-col p-1">
                      <div className="w-full p-1 mb-2">
                        <div className="flex items-center gap-x-2">
                          <div className={newLocal}></div>
                          <span className="text-xs font-medium text-gray-400">My notes</span>
                        </div>
                      </div>
                      {documents.map((title, i) => {
                        const isActive = title === "Japan Trip Planning";
                        const isLinked = activeState === "linking" && title === "Trip Master Plan";
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-x-1.5 py-1 px-1.5 rounded-md truncate min-w-0 ${isActive ? "bg-black/5" : ""} ${isLinked ? "bg-blue-50 ring-1 ring-blue-200/60" : ""}`}
                          >
                            <DocumentIcon
                              className={`size-4 shrink-0 ${isActive ? "text-black/60" : isLinked ? "text-blue-500" : "text-black/30"}`}
                            />
                            <span
                              className={`text-[0.8125rem] select-none truncate ${isActive ? "font-medium text-black/60" : isLinked ? "font-medium text-blue-600" : "text-black/60"}`}
                            >
                              {title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                  <motion.div
                    className={`flex flex-1 overflow-hidden relative bg-white ${activeState === "assistant" ? "border-r border-black/8 rounded-r-lg" : "border-l border-black/8 rounded-l-lg"}`}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 35,
                    }}
                  >
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200">
                        <ToolbarItems />
                        {activeState === "collaboration" && (
                          <div className="-space-x-2 flex">
                            {collaborators.map((c, i) => (
                              <motion.div
                                key={c.name}
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{
                                  delay: 0.08 * i,
                                  duration: 0.3,
                                  ease: [0.25, 0.46, 0.45, 0.94],
                                }}
                                className="rounded-full size-6 border-2 border-white shrink-0 flex items-center justify-center text-[0.65rem] font-semibold text-white select-none"
                                style={{
                                  backgroundColor: c.color,
                                }}
                              >
                                {c.name[0]}
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        className={`px-8 py-6 max-w-[65ch] mx-auto overflow-hidden grow ${activeState === "assistant" ? "mask-r-from-0% mask-r-to-100%" : ""}`}
                      >
                        <DocumentContent currentState={activeState} />
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
                <AnimatePresence>{activeState === "search" && <SearchOverlay />}</AnimatePresence>
              </div>
              <AnimatePresence>
                {activeState === "assistant" && (
                  <motion.div
                    key="assistant-sidebar"
                    className="absolute inset-y-12 -right-12 bg-white ring ring-black/8 shadow-2xl rounded-xl h-full w-[380px]"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 35,
                    }}
                  >
                    <AIAssistantSidebar />
                  </motion.div>
                )}
              </AnimatePresence>
            </CastShadow>
          </div>
        </div>
      </div>
    </section>
  );
}

export { STATE_CONFIG, DEFAULT_STATE_ORDER };
export type { DemoState };

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
  // Animation sequence timing (in seconds)
  const SEQUENCE = {
    userMessage: 0,
    searchStart: 0.6,
    searchComplete: 2.0,
    readStart: 2.2,
    readComplete: 4.0,
    foundStart: 4.2,
    foundComplete: 5.5,
    assistantResponse: 6.0,
    userFollowUp: 8.5,
    assistantSuggestions: 10.0,
    assistantConfirm: 13.0,
  };

  const [animationState, setAnimationState] = React.useState({
    showUserMessage: false,
    showSearch: false,
    searchComplete: false,
    showRead: false,
    readComplete: false,
    showFound: false,
    foundComplete: false,
    showAssistantResponse: false,
    showUserFollowUp: false,
    showAssistantSuggestions: false,
    showAssistantConfirm: false,
  });

  React.useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showUserMessage: true })),
        SEQUENCE.userMessage * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showSearch: true })),
        SEQUENCE.searchStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, searchComplete: true })),
        SEQUENCE.searchComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showRead: true })),
        SEQUENCE.readStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, readComplete: true })),
        SEQUENCE.readComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showFound: true })),
        SEQUENCE.foundStart * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, foundComplete: true })),
        SEQUENCE.foundComplete * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showAssistantResponse: true })),
        SEQUENCE.assistantResponse * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showUserFollowUp: true })),
        SEQUENCE.userFollowUp * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showAssistantSuggestions: true })),
        SEQUENCE.assistantSuggestions * 1000,
      ),
    );
    timers.push(
      setTimeout(
        () => setAnimationState((s) => ({ ...s, showAssistantConfirm: true })),
        SEQUENCE.assistantConfirm * 1000,
      ),
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="shrink-0 flex flex-col overflow-hidden px-3 py-4">
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

function SearchOverlay() {
  // Example showing a search query with document results
  const searchQuery = "trip";

  const menuSections: CommandMenuSection[] = [
    {
      id: "favorites",
      heading: "Favorites",
      items: [
        { id: "create", label: "Create new document…", icon: "add" },
        { id: "publish", label: "Publish document", icon: "publish" },
      ],
    },
    {
      id: "navigation",
      heading: "Navigation",
      items: [
        { id: "search", label: "Search documents", icon: "search", selected: false },
        { id: "home", label: "Go home", icon: "home" },
        { id: "assistant", label: "Go to assistant", icon: "assistant" },
      ],
    },
    {
      id: "quick-results",
      heading: "Quick results",
      items: [
        { id: "doc-1", label: "Trip Master Plan", icon: "document" },
        { id: "doc-2", label: "Japan Trip Planning", icon: "document" },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="absolute inset-0 z-30 flex items-start justify-center pt-16 px-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/25 backdrop-blur-[1px]" />

      {/* Command Menu */}
      <div className="relative w-full max-w-xl">
        <CommandMenuIllustration
          query={searchQuery}
          placeholder="Type a command or search..."
          sections={menuSections}
        />
      </div>
    </motion.div>
  );
}

function LinkingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="absolute left-1/2 bottom-[calc(100%+0.75rem)] -translate-x-1/2 z-30 editor-content-reset"
    >
      <div className="bg-white rounded-xl shadow-legit ring ring-black/4 overflow-hidden w-[240px]">
        <div className="flex flex-col gap-2 p-2">
          <div className="border border-black/6 h-20 bg-gray-50 rounded-lg overflow-hidden relative">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
              className="bg-white shadow-legit rounded-lg h-32 absolute inset-x-8 top-4 p-2 flex flex-col gap-y-1"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "40%" }}
                transition={{ delay: 0.2, duration: 1, ease: [0.17, 0.67, 0.33, 1] }}
                exit={{ width: 0 }}
                className="h-2 bg-black/5 rounded-sm"
              />
              <div className="h-px w-full bg-gray-100"></div>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "70%" }}
                exit={{ width: 0 }}
                transition={{ delay: 0.25, duration: 1, ease: [0.17, 0.67, 0.33, 1] }}
                className="h-2 bg-black/5 rounded-sm"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "90%" }}
                transition={{ delay: 0.3, duration: 1, ease: [0.17, 0.67, 0.33, 1] }}
                exit={{ width: 0 }}
                className="h-2 bg-black/5 rounded-sm"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "60%" }}
                transition={{ delay: 0.35, duration: 1, ease: [0.17, 0.67, 0.33, 1] }}
                exit={{ width: 0 }}
                className="h-2 bg-black/5 rounded-sm"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "90%" }}
                transition={{ delay: 0.4, duration: 1, ease: [0.17, 0.67, 0.33, 1] }}
                exit={{ width: 0 }}
                className="h-2 bg-black/5 rounded-sm"
              />
            </motion.div>
          </div>
          <span className="text-sm font-medium text-gray-900">Trip Master Plan</span>
        </div>
      </div>
    </motion.div>
  );
}

function DocumentContent({ currentState }: { currentState: DemoState }) {
  const showCollaboration = currentState === "collaboration";

  return (
    <>
      <h1 className="text-[1.75rem] font-medium text-gray-900 mt-0 mb-4 select-none">
        Japan Trip Planning
      </h1>

      <div className="prose prose-sm editor-content">
        <p className="text-gray-700 leading-relaxed mb-4">
          So excited for our two-week adventure! We should finalize the itinerary and book the
          remaining stays.{" "}
          {showCollaboration ? (
            <>
              <span
                className="rounded-sm pointer-events-none"
                style={{ backgroundColor: `${collaborators[1].color}33` }}
              >
                Sarah will research Tokyo neighborhoods
              </span>
              <motion.span
                initial={{ opacity: 0, y: 6, scale: 1.1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ display: "inline" }}
              >
                <CollaborationCaret userName="Alex" userColor={collaborators[1].color} />
              </motion.span>
            </>
          ) : (
            "Sarah will research Tokyo neighborhoods"
          )}{" "}
          by tomorrow. <em>Check the weather forecast before we pack.</em>
        </p>

        <div className="relative">
          <p className="text-gray-700 leading-relaxed mb-4">
            For must-see spots and hidden gems, we&apos;re building off the
            {showCollaboration && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.15,
                  duration: 0.35,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                style={{ display: "inline" }}
              >
                <CollaborationCaret userName="Sarah" userColor={collaborators[0].color} />
              </motion.span>
            )}{" "}
            recommendations doc. I&apos;ll add the restaurant reservations once that&apos;s ready.
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
            <motion.span
              className="relative inline"
              animate={{
                backgroundColor:
                  currentState === "linking" ? "rgba(20, 20, 20, 0.05)" : "transparent",
              }}
              transition={{ duration: 0.2 }}
            >
              <span
                className={`text-sm font-medium decoration-2 ${currentState === "linking" ? "text-gray-900" : "text-gray-900"}`}
              >
                Trip Master Plan
              </span>
              <AnimatePresence>{currentState === "linking" && <LinkingOverlay />}</AnimatePresence>
            </motion.span>
            .
          </li>
          <li>
            <p>Book teamLab tickets in advance</p>
          </li>
          <li>
            <p>Confirm Airbnb check-in details for Osaka</p>
          </li>
          <li>
            <p>
              Look up luggage forwarding service options
              {showCollaboration && (
                <motion.span
                  initial={{ opacity: 0, y: 6, scale: 1.1 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: 0.3,
                    duration: 0.35,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  style={{ display: "inline" }}
                >
                  <CollaborationCaret userName="Jordan" userColor={collaborators[2].color} />
                </motion.span>
              )}
            </p>
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
