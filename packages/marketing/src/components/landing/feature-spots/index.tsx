import type { DemoState } from "../DemoStateSelector";

import { FeatureSpotAI } from "./FeatureSpotAI";
import { FeatureSpotCollaboration } from "./FeatureSpotCollaboration";
import { FeatureSpotLinking } from "./FeatureSpotLinking";
import { FeatureSpotSearch } from "./FeatureSpotSearch";

export interface FeatureSpotProps {
  type: DemoState;
  className?: string;
}

export function FeatureSpot({ type }: FeatureSpotProps) {
  const spots: Record<DemoState, React.ReactNode> = {
    search: <FeatureSpotSearch />,
    collaboration: <FeatureSpotCollaboration />,
    linking: <FeatureSpotLinking />,
    assistant: <FeatureSpotAI />,
  };

  return spots[type];
}

export { FeatureSpotSearch, FeatureSpotCollaboration, FeatureSpotLinking, FeatureSpotAI };
export type { DemoState };
