import { LinkRegular, PeopleTeamRegular, BotRegular, SearchRegular } from "@fluentui/react-icons";
import { motion } from "motion/react";
import { useCallback } from "react";

export type DemoState = "collaboration" | "linking" | "assistant" | "search";

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
  assistant: {
    id: "assistant",
    label: "AI Assistant",
    icon: BotRegular,
    showSidebar: true,
    sidebarWidth: 320,
  },
};

export const DEFAULT_STATE_ORDER: DemoState[] = ["collaboration", "linking", "assistant"];

type DemoStateSelectorProps = {
  states?: DemoState[];
  activeState: DemoState;
  onStateChange: (state: DemoState) => void;
  className?: string;
};

export function DemoStateSelector({
  states = DEFAULT_STATE_ORDER,
  activeState,
  onStateChange,
  className = "",
}: DemoStateSelectorProps) {
  const handleStateChange = useCallback(
    (newState: DemoState) => {
      onStateChange(newState);
    },
    [onStateChange],
  );

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <FeatureButtons
        states={states}
        currentState={activeState}
        onStateChange={handleStateChange}
      />
    </div>
  );
}

function FeatureButtons({
  states,
  currentState,
  onStateChange,
}: {
  states: DemoState[];
  currentState: DemoState;
  onStateChange: (state: DemoState) => void;
}) {
  const isActive = (id: DemoState) => currentState === id;

  return (
    <div className="inline-flex items-center gap-1 p-0.5 ring ring-black/8 rounded-full">
      {states.map((id) => {
        const config = STATE_CONFIG[id];
        const Icon = config.icon;

        return (
          <button
            type="button"
            key={id}
            onClick={() => onStateChange(id)}
            className="relative flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 text-gray-600 hover:text-gray-900 z-1 data-active:text-gray-900 [&:not([data-active])]:hover:bg-black/5"
            data-active={isActive(id) ? "" : undefined}
          >
            {isActive(id) && (
              <motion.div
                layoutId="feature-tab-highlight"
                className="absolute inset-0 rounded-full bg-white shadow-sm -z-10 ring ring-black/5"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ zIndex: -1 }}
              />
            )}
            <span className="relative inline-flex items-center justify-center size-5 shrink-0">
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
