import { LinkRegular, PeopleTeamRegular, BotRegular, SearchRegular } from "@fluentui/react-icons";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

export type DemoState = "collaboration" | "linking" | "ai-assistant" | "search";

interface StateConfig {
  id: DemoState;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showSidebar: boolean;
  sidebarWidth: number;
}

export const STATE_CONFIG: Record<DemoState, StateConfig> = {
  search: {
    id: "search",
    label: "Search",
    icon: SearchRegular,
    showSidebar: false,
    sidebarWidth: 0,
  },
  collaboration: {
    id: "collaboration",
    label: "Collaboration",
    icon: PeopleTeamRegular,
    showSidebar: false,
    sidebarWidth: 0,
  },
  linking: {
    id: "linking",
    label: "Internal Linking",
    icon: LinkRegular,
    showSidebar: false,
    sidebarWidth: 0,
  },
  "ai-assistant": {
    id: "ai-assistant",
    label: "AI Assistant",
    icon: BotRegular,
    showSidebar: true,
    sidebarWidth: 320,
  },
};

export const DEFAULT_STATE_ORDER: DemoState[] = [
  "search",
  "collaboration",
  "linking",
  "ai-assistant",
];

const AUTO_ADVANCE_MS = 9000;

function getNextState(current: DemoState, stateOrder: DemoState[]): DemoState {
  const idx = stateOrder.indexOf(current);
  return stateOrder[(idx + 1) % stateOrder.length];
}

type DemoStateSelectorProps = {
  states?: DemoState[];
  activeState: DemoState;
  onStateChange: (state: DemoState) => void;
  isAutoPlaying?: boolean;
  onAutoPlayChange?: (isAutoPlaying: boolean) => void;
  className?: string;
};

export function DemoStateSelector({
  states = DEFAULT_STATE_ORDER,
  activeState,
  onStateChange,
  isAutoPlaying: externalIsAutoPlaying,
  onAutoPlayChange,
  className = "",
}: DemoStateSelectorProps) {
  const [internalIsAutoPlaying, setInternalIsAutoPlaying] = useState(true);
  const isAutoPlaying = externalIsAutoPlaying ?? internalIsAutoPlaying;
  const setIsAutoPlaying = onAutoPlayChange ?? setInternalIsAutoPlaying;

  // Auto-advance timer
  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setTimeout(() => {
      onStateChange(getNextState(activeState, states));
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [activeState, isAutoPlaying, states, onStateChange]);

  const handleStateChange = useCallback(
    (newState: DemoState) => {
      onStateChange(newState);
      setIsAutoPlaying(false);
    },
    [onStateChange, setIsAutoPlaying],
  );

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <FeatureButtons
        states={states}
        currentState={activeState}
        onStateChange={handleStateChange}
        isAutoPlaying={isAutoPlaying}
        countdownMs={AUTO_ADVANCE_MS}
      />
    </div>
  );
}

const RING_SIZE = 20;
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

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
  const isActive = (id: DemoState) => currentState === id;
  const showRing = (id: DemoState) => isActive(id);

  return (
    <div className="rounded-full p-1 flex items-center gap-1 border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay bg-black/85 text-white backdrop-blur-sm">
      {states.map((id) => {
        const config = STATE_CONFIG[id];
        const Icon = config.icon;

        return (
          <button
            type="button"
            key={id}
            onClick={() => onStateChange(id)}
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
              {showRing(id) && isAutoPlaying && (
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
              <Icon
                className={`shrink-0 size-4 relative z-1 ${isActive(id) ? "scale-60" : "scale-100"} transition-transform duration-250 ease-in-out`}
              />
            </span>
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
