import { getColorById } from "@lydie/core/colors";
import { CollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { AnimatePresence, motion } from "motion/react";

import type { DemoState } from "./DemoStateSelector";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
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
      <div className="rounded-2xl ring ring-outline-subtle flex flex-col w-full max-w-232 p-2 relative bg-grain-dark">
        <GradientOutline />
        <div className="flex items-center gap-x-1.5 mb-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-full size-3 ring ring-black/6 shrink-0" />
          ))}
        </div>
        <div className="flex gap-x-2">
          <CastShadow className="w-full rounded-b-xl rounded-t-lg">
            <div className="flex flex-1 h-[580px] rounded-b-xl rounded-t-lg overflow-hidden bg-[#fcfcfc] shadow-xl ring ring-black/4 relative">
              <motion.div
                className=""
                animate={{
                  width: activeState === "ai-assistant" ? 0 : "auto",
                }}
              >
                <div className="w-44 flex flex-col p-1">
                  <div className="w-full p-1 mb-4">
                    <div className="size-5.5 rounded-md bg-black/12"></div>
                  </div>
                  {documents.map((title, i) => {
                    const isActive = title === "Japan Trip Planning";
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-x-1.5 py-1 px-1.5 rounded-md truncate min-w-0 ${isActive ? "bg-gray-200/80" : ""}`}
                      >
                        <DocumentIcon
                          className={`size-4 shrink-0 ${isActive ? "text-black/60" : "text-black/20"}`}
                        />
                        <span
                          className={`text-[0.8125rem] select-none truncate ${isActive ? "font-medium text-black/60" : "text-black/40"}`}
                        >
                          {title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
              <motion.div
                className="flex flex-1 overflow-hidden relative rounded-l-lg rounded-tr-[7px] rounded-br-[9px] bg-white ring ring-black/2 shadow-sm m-1"
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
                              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
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
                {activeState === "ai-assistant" && <AIAssistantSidebar />}
              </AnimatePresence>
              <AnimatePresence>{activeState === "search" && <SearchOverlay />}</AnimatePresence>
            </div>
          </CastShadow>
        </div>
      </div>
    </section>
  );
}

export { STATE_CONFIG, DEFAULT_STATE_ORDER };
export type { DemoState };

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
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2">
          <div className="rounded-full size-6 flex items-center justify-center bg-purple-100 text-purple-600">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-900">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-black/5 text-gray-500" aria-label="New chat">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button className="p-1 rounded hover:bg-black/5 text-gray-500" aria-label="Close">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex gap-2">
          <div className="rounded-full size-6 bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-gray-600">You</span>
          </div>
          <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-sm text-gray-700">
            Help me make this itinerary more exciting and fun
          </div>
        </div>

        <div className="flex gap-2">
          <div className="rounded-full size-6 bg-purple-100 flex items-center justify-center shrink-0">
            <svg className="size-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <div className="flex-1 space-y-2">
            <div className="bg-purple-50 rounded-lg p-2.5 text-sm text-gray-700">
              Here are some ways to make your Japan trip more exciting:
            </div>
            <div className="bg-purple-50/50 rounded-lg p-2.5 text-sm text-gray-700 space-y-1.5">
              <p>🎌 Add a traditional tea ceremony experience in Kyoto</p>
              <p>🍜 Include a ramen tour in Tokyo&apos;s best districts</p>
              <p>🗻 Plan a sunrise hike at Mt. Fuji</p>
              <p>🎮 Visit an arcade in Akihabara</p>
            </div>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-2">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <input
            type="text"
            placeholder="Ask anything..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            readOnly
          />
          <button className="p-1 rounded hover:bg-black/5 text-gray-500">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ToolbarItems() {
  return (
    <div className="flex items-center gap-1">
      {/* Simple toolbar buttons - using text for simplicity */}
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700" title="Bold">
        <span className="text-xs font-bold">B</span>
      </button>
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700" title="Italic">
        <span className="text-xs italic">I</span>
      </button>
      <div className="mx-1 h-6 w-px bg-gray-200" />
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Heading 1">
        H1
      </button>
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Heading 2">
        H2
      </button>
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Heading 3">
        H3
      </button>
      <div className="mx-1 h-6 w-px bg-gray-200" />
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Bullet List">
        •
      </button>
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Numbered List">
        1.
      </button>
      <div className="mx-1 h-6 w-px bg-gray-200" />
      <button className="p-1 rounded hover:bg-gray-100 text-gray-700 text-xs" title="Link">
        Link
      </button>
    </div>
  );
}

function SearchOverlay() {
  const menuSections = [
    {
      title: "Favorites",
      items: [
        { label: "Create new document", selected: false },
        { label: "Publish document", selected: false },
      ],
    },
    {
      title: "Navigation",
      items: [
        { label: "Search documents", selected: true },
        { label: "Go home", selected: false },
        { label: "Go to assistant", selected: false },
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
      <div className="relative w-full max-w-xl rounded-xl shadow-popover bg-gray-50 overflow-hidden">
        <div className="flex items-center border-b border-gray-100 px-3 bg-white">
          <svg
            className="size-4 text-gray-400 mr-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Type a command or search..."
            className="flex h-11 w-full border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
            readOnly
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {menuSections.map((section, sectionIndex) => (
            <div key={section.title}>
              <div
                className={`px-3 py-1 text-xs font-medium text-gray-500 text-left ${sectionIndex > 0 ? "mt-2" : ""}`}
              >
                {section.title}
              </div>
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={`relative flex cursor-pointer select-none items-center rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-150 ${
                    item.selected ? "bg-gray-100 text-gray-950" : "text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className="size-4 text-gray-400 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Keyboard help footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 bg-white text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↑↓</kbd>
              <span>to navigate</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LinkingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute left-1/2 bottom-[calc(100%+1rem)] -translate-x-1/2 z-30"
    >
      {/* Connector line + arrow pointing from card back to the linked text */}
      <div
        className="absolute right-full top-1/2 -translate-y-1/2 h-px bg-gray-200 w-2"
        aria-hidden
      />
      <div
        className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-l-[6px] border-l-gray-200 -mr-2"
        aria-hidden
      />
      <div className="bg-white rounded-lg shadow-popover border border-gray-100 overflow-hidden w-[220px]">
        <div className="flex items-center gap-2.5 p-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900 truncate">Trip Master Plan</div>
            <div className="text-xs text-gray-500">Shared document</div>
          </div>
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
              currentState === "ai-assistant"
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
              <strong>JR Pass</strong> — order online by end of week
            </p>
          </li>
          <li>
            <p>Reserve that ryokan in Kyoto with the onsen</p>
          </li>
          <li className="text-gray-700">
            For the full itinerary and daily schedule, see{" "}
            <span className="relative inline">
              <span className="text-sm font-medium decoration-2 text-gray-900">
                Trip Master Plan
              </span>
              <AnimatePresence>{currentState === "linking" && <LinkingOverlay />}</AnimatePresence>
            </span>
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
