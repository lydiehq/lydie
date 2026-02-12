import { FeatureSpotAI } from "./FeatureSpotAI";
import { FeatureSpotCollaboration } from "./FeatureSpotCollaboration";
import { FeatureSpotLinking } from "./FeatureSpotLinking";
import { FeatureSpotOpenSource } from "./FeatureSpotOpenSource";
import { FeatureSpotSearch } from "./FeatureSpotSearch";

export {
  FeatureSpotAI,
  FeatureSpotCollaboration,
  FeatureSpotLinking,
  FeatureSpotOpenSource,
  FeatureSpotSearch,
};

export const sectionIllustrations = {
  assistant: FeatureSpotAI,
  search: FeatureSpotSearch,
  linking: FeatureSpotLinking,
  collaboration: FeatureSpotCollaboration,
  opensource: FeatureSpotOpenSource,
  performance: FeatureSpotSearch,
  integrations: FeatureSpotAI,
} as const;

export type SectionIllustrationId = keyof typeof sectionIllustrations;
