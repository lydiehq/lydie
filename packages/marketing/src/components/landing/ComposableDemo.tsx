import { getColorById } from "@lydie/core/colors";
import { CollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { AnimatePresence, motion } from "motion/react";

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
              <div className="flex flex-1 h-[580px] rounded-b-xl rounded-t-lg overflow-hidden bg-white shadow-xl ring ring-black/8 relative">
                <motion.div
                  className=""
                  animate={{
                    width: activeState === "assistant" ? 0 : "auto",
                  }}
                >
                  <div className="w-52 flex flex-col p-1">
                    <div className="w-full p-1 mb-2">
                      <div className="flex items-center gap-x-2">
                        <div className="size-5.5 rounded-md border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative bg-pink-300"></div>
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

                    <div className="px-8 py-6 max-w-[65ch] mx-auto overflow-hidden grow">
                      <DocumentContent currentState={activeState} />
                    </div>
                  </div>
                </motion.div>
                <AnimatePresence>
                  {activeState === "assistant" && <AIAssistantSidebar />}
                </AnimatePresence>
                <AnimatePresence>{activeState === "search" && <SearchOverlay />}</AnimatePresence>
              </div>
            </CastShadow>
          </div>
        </div>
      </div>
    </section>
  );
}

export { STATE_CONFIG, DEFAULT_STATE_ORDER };
export type { DemoState };

const DEMO_MESSAGES = [
  {
    id: "user-1",
    type: "user",
    content: "Help me make this itinerary more exciting and fun",
  },
  {
    id: "assistant-1",
    type: "assistant",
    content: "Here are some ways to make your Japan trip more exciting:",
  },
  {
    id: "assistant-2",
    type: "assistant",
    content:
      "🎌 Add a traditional tea ceremony experience in Kyoto\n🍜 Include a ramen tour in Tokyo's best districts\n🗻 Plan a sunrise hike at Mt. Fuji\n🎮 Visit an arcade in Akihabara",
  },
];

type MessageProps = {
  content: string;
};

function UserMessage({ content }: MessageProps) {
  return (
    <div className="flex self-end justify-end max-w-[85%]">
      <div className="bg-white shadow-md ring ring-black/4 rounded-2xl rounded-tr-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({ content }: MessageProps) {
  return (
    <div className="flex self-start justify-start max-w-[85%] flex-col gap-y-1.5">
      <div className=" bg-white ring ring-black/4 shadow-md rounded-2xl rounded-tl-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function AIAssistantSidebar() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30, width: 0 }}
      animate={{ opacity: 1, x: 0, width: 320 }}
      exit={{ opacity: 0, x: 30, width: 0 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 35,
        opacity: { duration: 0.2 },
      }}
      className="shrink-0 flex flex-col overflow-hidden"
    >
      <div className="flex flex-col gap-y-1.5">
        {DEMO_MESSAGES.map((message) => (
          <div key={message.id}>
            {message.type === "user" ? (
              <UserMessage content={message.content} />
            ) : (
              <AssistantMessage content={message.content} />
            )}
          </div>
        ))}
      </div>
    </motion.div>
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
        <div className="flex flex-col gap-3 p-2">
          <div className="flex flex-col gap-y-0.5 w-full p-1 rounded-lg ring ring-black/4 bg-gray-100">
            <div className="h-3 w-[85%] rounded-md bg-black/5"></div>
            <div className="h-3 w-[90%] rounded-md bg-black/5"></div>
            <div className="h-3 w-[75%] rounded-md bg-black/5"></div>
            <div className="h-3 w-[90%] rounded-md bg-black/5"></div>
            <div className="h-3 w-[80%] rounded-md bg-black/5"></div>
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
          <p
            className={`text-gray-700 leading-relaxed mb-4 ${
              currentState === "assistant"
                ? "rounded-sm bg-blue-100/50 ring-2 ring-blue-400/40 px-2 py-1"
                : ""
            }`}
          >
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
                  currentState === "linking" ? "rgba(59, 130, 246, 0.12)" : "transparent",
              }}
              transition={{ duration: 0.2 }}
            >
              <span
                className={`text-sm font-medium decoration-2 ${currentState === "linking" ? "text-blue-600 underline underline-offset-2" : "text-gray-900"}`}
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
