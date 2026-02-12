/**
 * Section Illustrations Registry
 *
 * This is the single source of truth for all section illustrations.
 * To edit a section's illustration, modify the corresponding component here.
 *
 * Mapping:
 * - assistant → FeatureSpotAI.tsx
 * - search → FeatureSpotSearch.tsx
 * - linking → FeatureSpotLinking.tsx
 * - collaboration → FeatureSpotCollaboration.tsx
 * - opensource → FeatureSpotOpenSource.tsx
 * - performance → FeatureSpotSearch.tsx (reuses search illustration)
 * - integrations → FeatureSpotAI.tsx (reuses AI illustration)
 * - knowledgebase → FeatureSpotLinking.tsx (reuses linking illustration)
 */

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

/** Maps section IDs to their illustration components for easy editing */
export const sectionIllustrations = {
  assistant: FeatureSpotAI,
  search: FeatureSpotSearch,
  linking: FeatureSpotLinking,
  collaboration: FeatureSpotCollaboration,
  opensource: FeatureSpotOpenSource,
  performance: FeatureSpotSearch,
  integrations: FeatureSpotAI,
  knowledgebase: FeatureSpotLinking,
} as const;

export type SectionIllustrationId = keyof typeof sectionIllustrations;
