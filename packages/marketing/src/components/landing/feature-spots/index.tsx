import type { DemoState } from "../DemoStateSelector";

import { FeatureSpotAI } from "./FeatureSpotAI";
import { FeatureSpotCollaboration } from "./FeatureSpotCollaboration";
import { FeatureSpotLinking } from "./FeatureSpotLinking";
import { FeatureSpotSearch } from "./FeatureSpotSearch";

export interface FeatureSpotProps {
  type: DemoState;
  className?: string;
}

export function FeatureSpot({ type, className = "" }: FeatureSpotProps) {
  const spots: Record<DemoState, React.ReactNode> = {
    search: <FeatureSpotSearch />,
    collaboration: <FeatureSpotCollaboration />,
    linking: <FeatureSpotLinking />,
    "ai-assistant": <FeatureSpotAI />,
  };

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden bg-gradient-to-br from-gray-50/80 to-gray-100/50 ring-1 ring-black/5 ${className}`}
    >
      {spots[type]}
    </div>
  );
}

export { FeatureSpotSearch, FeatureSpotCollaboration, FeatureSpotLinking, FeatureSpotAI };
export type { DemoState };
