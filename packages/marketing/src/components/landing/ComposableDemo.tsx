import {
  SearchRegular,
  LinkRegular,
  OrganizationRegular,
  BotRegular,
  TextEditStyleRegular,
  DocumentRegular,
  FolderRegular,
  ChevronRightRegular,
  AddRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { AnimatePresence, motion, type Transition, type Variants } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";

// =============================================================================
// TYPES & STATE MACHINE
// =============================================================================

type DemoState = "writing" | "organization" | "linking" | "search" | "ai-assistant";

type PageView = "document" | "settings";

interface StateConfig {
  id: DemoState;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  showSidebar: boolean;
  showToolbar: boolean;
  sidebarWidth: number;
  pageView: PageView;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const STATE_CONFIG: Record<DemoState, StateConfig> = {
  writing: {
    id: "writing",
    label: "Writing",
    description: "Focus on your content with a clean, ergonomic editor",
    icon: TextEditStyleRegular,
    showSidebar: false,
    showToolbar: true,
    sidebarWidth: 0,
    pageView: "document",
  },
  organization: {
    id: "organization",
    label: "Organization",
    description: "Structure your knowledge with nested pages and folders",
    icon: OrganizationRegular,
    showSidebar: true,
    showToolbar: true,
    sidebarWidth: 240,
    pageView: "document",
  },
  linking: {
    id: "linking",
    label: "Internal Linking",
    description: "Connect ideas and build a web of knowledge",
    icon: LinkRegular,
    showSidebar: true,
    showToolbar: true,
    sidebarWidth: 200,
    pageView: "document",
  },
  search: {
    id: "search",
    description: "Find anything in seconds with powerful search",
    label: "Search",
    icon: SearchRegular,
    showSidebar: false,
    showToolbar: true,
    sidebarWidth: 0,
    pageView: "document",
  },
  "ai-assistant": {
    id: "ai-assistant",
    label: "AI Assistant",
    description: "Get help organizing, summarizing, and expanding your ideas",
    icon: BotRegular,
    showSidebar: true,
    showToolbar: true,
    sidebarWidth: 200,
    pageView: "document",
  },
};

const STATE_ORDER: DemoState[] = ["writing", "organization", "linking", "search", "ai-assistant"];

const AUTO_ADVANCE_MS = 8000;

const TRANSITION_CONFIG: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

const SIDEBAR_VARIANTS: Variants = {
  hidden: {
    x: -20,
    opacity: 0,
    width: 0,
  },
  visible: (width: number) => ({
    x: 0,
    opacity: 1,
    width,
    transition: {
      ...TRANSITION_CONFIG,
      width: {
        type: "spring",
        stiffness: 400,
        damping: 35,
      },
    },
  }),
  exit: {
    x: -20,
    opacity: 0,
    width: 0,
    transition: {
      duration: 0.2,
      ease: "easeInOut",
    },
  },
};

const CONTENT_VARIANTS: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: TRANSITION_CONFIG,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 20 : -20,
    opacity: 0,
    transition: { duration: 0.2 },
  }),
};

// =============================================================================
// DEMO CONTENT
// =============================================================================

const EDITOR_CONTENT = {
  title: "Machine Learning Fundamentals",
  paragraphs: [
    {
      id: "p1",
      content:
        "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed. The core idea is to build algorithms that can receive input data and use statistical analysis to predict an output while updating outputs as new data becomes available.",
      highlight: null as { text: string; color: string } | null,
    },
    {
      id: "p2",
      content:
        "There are three main types of machine learning: supervised learning, where the algorithm learns from labeled training data; unsupervised learning, where the algorithm finds hidden patterns in unlabeled data; and reinforcement learning, where the algorithm learns by interacting with an environment and receiving rewards or penalties.",
      highlight: { text: "supervised learning", color: "#7DBCD633" },
    },
    {
      id: "p3",
      content:
        "For more detailed examples and code implementations, see the related resources and documentation. The practical applications span across numerous industries including healthcare, finance, autonomous vehicles, and natural language processing.",
      highlight: null,
    },
  ],
};

interface SidebarDocItem {
  id: string;
  title: string;
  type: "doc";
  active: boolean;
}

interface SidebarFolderItem {
  id: string;
  title: string;
  type: "folder";
  expanded: boolean;
  children: SidebarDocItem[];
}

const SIDEBAR_ITEMS: SidebarFolderItem[] = [
  {
    id: "1",
    title: "Getting Started",
    type: "folder",
    expanded: true,
    children: [
      { id: "1-1", title: "Introduction to ML", type: "doc", active: false },
      { id: "1-2", title: "Machine Learning Fundamentals", type: "doc", active: true },
      { id: "1-3", title: "Setting Up Your Environment", type: "doc", active: false },
    ],
  },
  {
    id: "2",
    title: "Core Concepts",
    type: "folder",
    expanded: false,
    children: [
      { id: "2-1", title: "Neural Networks", type: "doc", active: false },
      { id: "2-2", title: "Deep Learning", type: "doc", active: false },
      { id: "2-3", title: "Training & Validation", type: "doc", active: false },
    ],
  },
  {
    id: "3",
    title: "Projects",
    type: "folder",
    expanded: false,
    children: [
      { id: "3-1", title: "Image Classification", type: "doc", active: false },
      { id: "3-2", title: "Sentiment Analysis", type: "doc", active: false },
    ],
  },
  { id: "4", title: "Resources", type: "folder", expanded: false, children: [] },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getNextState(current: DemoState): DemoState {
  const idx = STATE_ORDER.indexOf(current);
  return STATE_ORDER[(idx + 1) % STATE_ORDER.length];
}

function getStateDirection(from: DemoState, to: DemoState): number {
  const fromIdx = STATE_ORDER.indexOf(from);
  const toIdx = STATE_ORDER.indexOf(to);
  return toIdx > fromIdx ? 1 : -1;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ComposableDemo() {
  const [currentState, setCurrentState] = useState<DemoState>("writing");
  const [previousState, setPreviousState] = useState<DemoState | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const direction = useMemo(() => {
    if (!previousState) return 1;
    return getStateDirection(previousState, currentState);
  }, [previousState, currentState]);

  const config = STATE_CONFIG[currentState];

  // Auto-advance timer
  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setTimeout(() => {
      setPreviousState(currentState);
      setCurrentState(getNextState(currentState));
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [currentState, isAutoPlaying]);

  // Simulate search when in search state
  useEffect(() => {
    if (currentState === "search") {
      setSearchQuery("supervised learning");
      const timer = setTimeout(() => {
        setSearchResults([
          "Machine Learning Fundamentals",
          "Introduction to ML",
          "Training & Validation",
        ]);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [currentState]);

  const handleStateChange = useCallback(
    (newState: DemoState) => {
      setPreviousState(currentState);
      setCurrentState(newState);
      setIsAutoPlaying(false);
    },
    [currentState],
  );

  return (
    <section className="flex flex-col items-center overflow-visible w-full">
      <div className="rounded-2xl ring ring-black/4 flex flex-col w-full max-w-5xl p-2 relative bg-grain">
        <GradientOutline />
        <div className="flex items-center gap-x-1.5 mb-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-full size-3 ring ring-black/12 shrink-0" />
          ))}
        </div>

        <CastShadow className="w-full rounded-b-xl rounded-t-lg" height={80}>
          <div className="flex flex-col flex-1 h-[600px] rounded-b-xl rounded-t-lg overflow-hidden bg-white shadow-legit relative">
            {/* Feature Toggle Buttons */}
            <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-white flex items-end justify-center pb-4 pt-20 rounded-b-xl z-20">
              <FeatureButtons
                states={STATE_ORDER}
                currentState={currentState}
                onStateChange={handleStateChange}
                isAutoPlaying={isAutoPlaying}
                countdownMs={AUTO_ADVANCE_MS}
              />
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
              {/* Animated Sidebar */}
              <AnimatePresence mode="wait" initial={false}>
                {config.showSidebar && (
                  <motion.div
                    key="sidebar"
                    custom={config.sidebarWidth}
                    variants={SIDEBAR_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-hidden"
                  >
                    <SidebarContent currentState={currentState} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Editor Area */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <AnimatePresence mode="wait">
                  {config.showToolbar && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex justify-between items-center px-3 py-2 border-b border-gray-100"
                    >
                      <ToolbarItems />
                      <div className="flex items-center gap-2">
                        {currentState === "organization" && (
                          <motion.button
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                          >
                            <AddRegular className="size-3.5" />
                            <span>New Page</span>
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Search Overlay */}
                <AnimatePresence>
                  {currentState === "search" && (
                    <SearchOverlay query={searchQuery} results={searchResults} />
                  )}
                </AnimatePresence>

                {/* Document Content */}
                <motion.div
                  key={currentState}
                  custom={direction}
                  variants={CONTENT_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex-1 px-8 py-6 max-w-[65ch] mx-auto overflow-y-auto"
                >
                  <DocumentContent currentState={currentState} />
                </motion.div>
              </div>
            </div>
          </div>
        </CastShadow>
      </div>
    </section>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function FeatureButtons({
  states,
  currentState,
  onStateChange,
  isAutoPlaying,
  countdownMs,
}: {
  states: DemoState[];
  currentState: DemoState;
  onStateChange: (state: DemoState) => void;
  isAutoPlaying: boolean;
  countdownMs: number;
}) {
  const RING_SIZE = 20;
  const RING_STROKE = 2;
  const RING_R = (RING_SIZE - RING_STROKE) / 2;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

  return (
    <div className="rounded-full p-1 flex items-center gap-1 border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] bg-black/85 text-white backdrop-blur-sm">
      {states.map((stateId) => {
        const config = STATE_CONFIG[stateId];
        const Icon = config.icon;
        const isActive = currentState === stateId;

        return (
          <button
            key={stateId}
            type="button"
            onClick={() => onStateChange(stateId)}
            className="relative flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.8125rem]/0 font-medium transition-colors text-white/90 hover:text-white z-0 data-active:text-white [&:not([data-active])]:hover:bg-white/15"
            data-active={isActive ? "" : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="demo-tab-highlight"
                className="absolute inset-0 rounded-full bg-white/30"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ zIndex: -1 }}
              />
            )}
            <span className="relative inline-flex items-center justify-center size-5 shrink-0">
              {isActive && isAutoPlaying && (
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
                    transition={{ duration: countdownMs / 1000, ease: "linear" }}
                    className="text-white/20"
                  />
                </svg>
              )}
              <Icon className="shrink-0 size-4 relative z-1" />
            </span>
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SidebarContent({ currentState }: { currentState: DemoState }) {
  if (currentState === "organization") {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-500">
            <FolderRegular className="size-4" />
            <span className="text-xs font-medium">Knowledge Base</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {SIDEBAR_ITEMS.map((item) => (
            <SidebarFolder key={item.id} item={item} depth={0} />
          ))}
        </div>
        <div className="px-3 py-2 border-t border-gray-100">
          <button className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 w-full px-2 py-1.5 rounded hover:bg-gray-100">
            <AddRegular className="size-3.5" />
            <span>New Folder</span>
          </button>
        </div>
      </div>
    );
  }

  if (currentState === "linking") {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500">Linked Pages</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-3">
          <div className="space-y-1">
            <LinkItem title="Introduction to ML" type="backlink" />
            <LinkItem title="Neural Networks" type="related" />
            <LinkItem title="Training & Validation" type="related" />
            <LinkItem title="Supervised Learning Guide" type="mention" />
          </div>
        </div>
      </div>
    );
  }

  if (currentState === "ai-assistant") {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500">AI Suggestions</span>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-3">
            <AISuggestionCard
              type="summarize"
              title="Summarize this page"
              description="Create a brief summary of the key concepts"
            />
            <AISuggestionCard
              type="expand"
              title="Expand on neural networks"
              description="Add more detail about activation functions"
            />
            <AISuggestionCard
              type="connect"
              title="Find related notes"
              description="Discover connections to existing pages"
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function SidebarFolder({ item, depth }: { item: SidebarFolderItem; depth: number }) {
  const [expanded, setExpanded] = useState(item.expanded);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <ChevronRightRegular
          className={`size-3.5 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <FolderRegular className="size-4 text-gray-400" />
        <span className="truncate">{item.title}</span>
      </button>
      {expanded &&
        item.children.map((child) => <SidebarDoc key={child.id} item={child} depth={depth + 1} />)}
    </div>
  );
}

function SidebarDoc({ item, depth }: { item: SidebarDocItem; depth: number }) {
  return (
    <button
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded hover:bg-gray-100 ${
        item.active ? "bg-blue-50 text-blue-700" : "text-gray-700"
      }`}
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <DocumentRegular className="size-4 text-gray-500" />
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function LinkItem({ title, type }: { title: string; type: "backlink" | "related" | "mention" }) {
  const typeLabels = {
    backlink: "Links here",
    related: "Related",
    mention: "Mentioned",
  };

  const typeColors = {
    backlink: "text-blue-600 bg-blue-50",
    related: "text-gray-600 bg-gray-100",
    mention: "text-purple-600 bg-purple-50",
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer group">
      <DocumentRegular className="size-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm text-gray-700 truncate group-hover:text-gray-900">{title}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeColors[type]}`}>
          {typeLabels[type]}
        </span>
      </div>
    </div>
  );
}

function AISuggestionCard({
  type,
  title,
  description,
}: {
  type: "summarize" | "expand" | "connect";
  title: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-center gap-2 mb-1">
        <BotRegular className="size-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-900">{title}</span>
      </div>
      <p className="text-xs text-gray-500">{description}</p>
    </motion.div>
  );
}

function ToolbarItems() {
  return (
    <div className="flex items-center gap-1">
      <ToolbarButton>Undo</ToolbarButton>
      <ToolbarButton>Redo</ToolbarButton>
      <div className="mx-1 h-4 w-px bg-gray-200" />
      <ToolbarButton>B</ToolbarButton>
      <ToolbarButton>I</ToolbarButton>
      <ToolbarButton>U</ToolbarButton>
      <div className="mx-1 h-4 w-px bg-gray-200" />
      <ToolbarButton>H1</ToolbarButton>
      <ToolbarButton>H2</ToolbarButton>
      <div className="mx-1 h-4 w-px bg-gray-200" />
      <ToolbarButton>Link</ToolbarButton>
    </div>
  );
}

function ToolbarButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-sm font-medium min-w-[28px]">
      {children}
    </button>
  );
}

function SearchOverlay({ query, results }: { query: string; results: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute inset-x-0 top-12 z-30 flex justify-center px-4"
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-popover border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <SearchRegular className="size-5 text-gray-400" />
          <input
            type="text"
            value={query}
            readOnly
            className="flex-1 text-base outline-none"
            placeholder="Search your knowledge base..."
          />
          <button className="p-1 rounded hover:bg-gray-100">
            <DismissRegular className="size-4 text-gray-400" />
          </button>
        </div>
        <div className="py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <div className="animate-pulse">Searching...</div>
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                Pages
              </div>
              {results.map((result, idx) => (
                <motion.div
                  key={result}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                >
                  <DocumentRegular className="size-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{result}</span>
                  {idx === 0 && (
                    <span className="ml-auto text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      Best match
                    </span>
                  )}
                </motion.div>
              ))}
            </>
          )}
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 flex items-center justify-between">
          <span>Press Enter to open</span>
          <span>ESC to close</span>
        </div>
      </div>
    </motion.div>
  );
}

function DocumentContent({ currentState }: { currentState: DemoState }) {
  const isLinking = currentState === "linking";
  const isAIAssistant = currentState === "ai-assistant";

  return (
    <div className="prose prose-sm editor-content">
      <h1 className="text-[1.75rem] font-medium text-gray-900 mt-0 mb-4">{EDITOR_CONTENT.title}</h1>

      {EDITOR_CONTENT.paragraphs.map((para, idx) => (
        <div key={para.id} className="relative mb-4">
          <p className="text-gray-700 leading-relaxed">
            {para.highlight ? (
              <>
                {para.content.split(para.highlight.text).map((part, partIdx, arr) => (
                  <span key={partIdx}>
                    {part}
                    {partIdx < arr.length - 1 && (
                      <span
                        className="rounded-sm"
                        style={{ backgroundColor: para.highlight!.color }}
                      >
                        {para.highlight!.text}
                      </span>
                    )}
                  </span>
                ))}
              </>
            ) : (
              para.content
            )}
          </p>

          {/* Linking Overlay for paragraph 3 */}
          {isLinking && idx === 2 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -right-4 top-1/2 -translate-y-1/2 translate-x-full z-20"
            >
              <div className="bg-white rounded-lg shadow-popover border border-gray-200 p-3 w-48">
                <div className="text-xs font-medium text-gray-500 mb-2">Create link to...</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <DocumentRegular className="size-3.5 text-gray-400" />
                    <span className="text-xs text-gray-700">Related Resources</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <DocumentRegular className="size-3.5 text-gray-400" />
                    <span className="text-xs text-gray-700">Documentation</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* AI Assistant Popover for paragraph 2 */}
          {isAIAssistant && idx === 1 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-1/2 -translate-x-1/2 -top-12 z-20"
            >
              <div className="bg-white rounded-lg shadow-popover border border-gray-200 px-3 py-2 flex items-center gap-2">
                <BotRegular className="size-4 text-blue-500" />
                <span className="text-xs text-gray-600">Want me to expand on these types?</span>
                <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Yes
                </button>
              </div>
            </motion.div>
          )}
        </div>
      ))}

      {/* Additional content for organization state */}
      {currentState === "organization" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 p-4 bg-blue-50/50 rounded-lg border border-blue-100"
        >
          <div className="flex items-center gap-2 mb-2">
            <FolderRegular className="size-4 text-blue-500" />
            <span className="text-sm font-medium text-blue-900">Organization Tip</span>
          </div>
          <p className="text-sm text-blue-700 m-0">
            Use folders to group related topics. You can nest folders infinitely to create a
            structure that matches how you think.
          </p>
        </motion.div>
      )}
    </div>
  );
}
