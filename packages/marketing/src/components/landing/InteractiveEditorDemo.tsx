import {
  LinkRegular,
  PeopleTeamRegular,
  FormNewRegular,
  PersonChatFilled,
  Document48Filled,
} from "@fluentui/react-icons";
import { getColorById } from "@lydie/core/colors";
import { CollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret.tsx";
import {
  BoldIcon,
  CodeIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  TableIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons.tsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";

type FeatureType = "collaboration" | "fields" | "linking" | null;

type ToolbarItem =
  | { type: "button"; title: string; Icon: React.ComponentType<{ className?: string }> }
  | { type: "separator" };

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { type: "button", title: "Bold", Icon: BoldIcon },
  { type: "button", title: "Italic", Icon: ItalicIcon },
  { type: "button", title: "Strikethrough", Icon: StrikethroughIcon },
  { type: "button", title: "Code", Icon: CodeIcon },
  { type: "separator" },
  { type: "button", title: "Heading 1", Icon: H1Icon },
  { type: "button", title: "Heading 2", Icon: H2Icon },
  { type: "button", title: "Heading 3", Icon: H3Icon },
  { type: "separator" },
  { type: "button", title: "Bullet List", Icon: BulletListIcon },
  { type: "button", title: "Ordered List", Icon: OrderedListIcon },
  { type: "separator" },
  { type: "button", title: "Add Link", Icon: LinkIcon },
  { type: "separator" },
  { type: "button", title: "Insert Image", Icon: ImageIcon },
  { type: "separator" },
  { type: "button", title: "Insert Table", Icon: TableIcon },
];

const FEATURES: {
  id: Exclude<FeatureType, null>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "collaboration", label: "Collaboration", icon: PeopleTeamRegular },
  { id: "fields", label: "AI Assistant", icon: FormNewRegular },
  { id: "linking", label: "Internal Linking", icon: LinkRegular },
];

const collaborators = [
  { name: "Sarah", color: getColorById("cyan")?.value ?? "#7DBCD6" },
  { name: "Alex", color: getColorById("green")?.value ?? "#90C9AA" },
  { name: "Jordan", color: getColorById("gold")?.value ?? "#E8B974" },
];

const COUNTDOWN_MS = 9000;
const FEATURE_ORDER: Exclude<FeatureType, null>[] = ["collaboration", "fields", "linking"];

function getNextFeature(current: Exclude<FeatureType, null>): Exclude<FeatureType, null> {
  const i = FEATURE_ORDER.indexOf(current);
  return FEATURE_ORDER[(i + 1) % FEATURE_ORDER.length];
}

export function InteractiveEditorDemo() {
  const [activeFeature, setActiveFeature] = useState<FeatureType>("collaboration");

  useEffect(() => {
    if (!activeFeature) return;
    const t = setTimeout(() => setActiveFeature(getNextFeature(activeFeature)), COUNTDOWN_MS);
    return () => clearTimeout(t);
  }, [activeFeature]);

  const showCollaboration = activeFeature === "collaboration";

  return (
    <section className="flex flex-col items-center overflow-visible w-full">
      <div className="rounded-2xl ring ring-black/4 flex flex-col w-full max-w-5xl p-2 relative bg-grain">
        <span className="absolute -top-6 -right-8 text-xs text-black/12" aria-hidden="true">
          90°
        </span>
        <GradientOutline />
        <div className="flex items-center gap-x-1.5 mb-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-full size-3 ring ring-black/12 shrink-0" />
          ))}
        </div>
        <CastShadow className="w-full rounded-b-xl rounded-t-lg" height={100}>
            <div className="flex flex-1 h-[620px] rounded-b-xl rounded-t-lg overflow-hidden bg-white shadow-legit">
              {/* Main Editor Area */}
              <div className="flex flex-col flex-1 min-w-0">
            <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-white flex items-end justify-center pb-4 pt-20 rounded-b-xl">
              <FeatureButtons
                features={FEATURES}
                activeFeature={activeFeature}
                onFeatureChange={setActiveFeature}
                countdownMs={COUNTDOWN_MS}
              />
            </div>
            <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200">
              <div className="flex items-center gap-1">
                {TOOLBAR_ITEMS.map((item, i) =>
                  item.type === "separator" ? (
                    <div key={i} className="mx-1 h-6 w-px bg-gray-200" />
                  ) : (
                    <ToolbarButton key={item.title} title={item.title}>
                      <item.Icon className="size-3.5" />
                    </ToolbarButton>
                  ),
                )}
              </div>
              {activeFeature === "collaboration" && (
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
              <h1 className="text-[1.75rem] font-medium text-gray-900 mt-0 mb-4 select-none">
                Japan Trip Planning
              </h1>

              <div className="prose prose-sm editor-content ">
                <p className="text-gray-700 leading-relaxed mb-4">
                  So excited for our two-week adventure! We should finalize the itinerary and book
                  the remaining stays.{" "}
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
                      activeFeature === "fields"
                        ? "rounded-sm bg-blue-100/50 ring-2 ring-blue-400/40 px-2 py-1"
                        : ""
                    }`}
                  >
                    For must-see spots and hidden gems, we're building off the
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
                    recommendations doc. I'll add the restaurant reservations once that's ready.
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
                      <AnimatePresence>
                        {activeFeature === "linking" && <LinkingOverlay />}
                      </AnimatePresence>
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
                          <CollaborationCaret
                            userName="Jordan"
                            userColor={collaborators[2].color}
                          />
                        </motion.span>
                      )}
                    </p>
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Packing checklist</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We'll do a final gear check the night before we leave. Make sure everyone has
                  comfortable walking shoes!
                </p>
                <ul className="list-disc pl-6 space-y-1 mb-4 text-gray-700">
                  <li>Portable chargers and universal adapters</li>
                  <li>Pocket WiFi or SIM cards</li>
                  <li>Cash for places that don't take cards</li>
                </ul>

                <p className="text-gray-700 leading-relaxed mb-0">
                  Can't wait! Drop any other ideas or spots we shouldn't miss.
                </p>
              </div>
            </div>
          </div>

          {/* AI Assistant Sidebar */}
          <AnimatePresence>
            {activeFeature === "fields" && <AIAssistantSidebar />}
          </AnimatePresence>
        </div>
      </CastShadow>
      </div>
    </section>
  );
}

const RING_SIZE = 20;
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function FeatureButtons({
  features,
  activeFeature,
  onFeatureChange,
  countdownMs,
}: {
  features: {
    id: Exclude<FeatureType, null>;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  activeFeature: FeatureType;
  onFeatureChange: (feature: FeatureType) => void;
  countdownMs: number;
}) {
  const isActive = (id: Exclude<FeatureType, null>) => activeFeature === id;
  const showRing = (id: Exclude<FeatureType, null>) => isActive(id);

  return (
    <div className="rounded-full p-1 flex items-center gap-1 border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay bg-black/85 text-white backdrop-blur-sm">
      {features.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onFeatureChange(activeFeature === id ? null : id)}
          className="relative flex items-center gap-2 px-2 py-1 rounded-full text-[0.8125rem]/0 font-medium transition-colors text-white/90 hover:text-white z-0 data-active:text-white [&:not([data-active])]:hover:bg-white/15"
          data-active={isActive(id) ? "" : undefined}
        >
          {isActive(id) && (
            <motion.div
              layoutId="feature-tab-highlight"
              className="absolute inset-0 rounded-full bg-white/30"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{ zIndex: -1 }}
            />
          )}
          <span className="relative inline-flex items-center justify-center size-5 shrink-0">
            {showRing(id) && (
              <svg
                className="absolute inset-0 size-full -rotate-90"
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                aria-hidden
              >
                <motion.circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{
                    duration: countdownMs / 1000,
                    ease: "linear",
                  }}
                  className="text-white/20"
                />
              </svg>
            )}
            <Icon
              className={`shrink-0 size-4 relative z-1 ${isActive(id) ? "scale-60" : "scale-100"} transition-transform duration-250 ease-in-out`}
            />
          </span>
          <span>{label}</span>
        </button>
      ))}
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
      className="shrink-0 bg-white ring-1 ring-black/6 rounded-lg flex flex-col overflow-hidden ml-2 shadow-popover"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-black/6 bg-white">
        <div className="flex items-center gap-2">
          <div className="rounded-full size-6 flex items-center justify-center bg-purple-100 text-purple-600">
            <PersonChatFilled className="size-3.5" />
          </div>
          <span className="text-sm font-medium text-gray-900">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-black/5 text-gray-500" aria-label="New chat">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button className="p-1 rounded hover:bg-black/5 text-gray-500" aria-label="Close">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* User Message */}
        <div className="flex gap-2">
          <div className="rounded-full size-6 bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-gray-600">You</span>
          </div>
          <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-sm text-gray-700">
            Help me make this itinerary more exciting and fun
          </div>
        </div>

        {/* AI Response */}
        <div className="flex gap-2">
          <div className="rounded-full size-6 bg-purple-100 flex items-center justify-center shrink-0">
            <PersonChatFilled className="size-3 text-purple-600" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="bg-purple-50 rounded-lg p-2.5 text-sm text-gray-700">
              Here are some ways to make your Japan trip more exciting:
            </div>
            <div className="bg-purple-50/50 rounded-lg p-2.5 text-sm text-gray-700 space-y-1.5">
              <p>🎌 Add a traditional tea ceremony experience in Kyoto</p>
              <p>🍜 Include a ramen tour in Tokyo's best districts</p>
              <p>🗻 Plan a sunrise hike at Mt. Fuji</p>
              <p>🎮 Visit an arcade in Akihabara</p>
            </div>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-2 border-t border-black/6 bg-white">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <input
            type="text"
            placeholder="Ask anything..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            readOnly
          />
          <button className="p-1 rounded hover:bg-black/5 text-gray-500">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
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
            <Document48Filled className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900 truncate">Trip Master Plan</div>
            <div className="text-xs text-gray-500">Shared document</div>
            Needs redesign
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Toolbar Button Component
function ToolbarButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button className="p-1 rounded hover:bg-gray-100 text-gray-700" title={title}>
      {children}
    </button>
  );
}

// Icon Components (only keeping icons not available in wysiwyg-icons.tsx)
function StrikethroughIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h16M6 6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v1M6 18c0 1.1.9 2 2 2h8c1.1 0 2 .9 2 2v-1"
      ></path>
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <circle cx="3.5" cy="6" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="12" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="18" r="1" fill="currentColor"></circle>
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="10" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <path
        d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></path>
    </svg>
  );
}
