import { CastShadow } from "@/components/generic/CastShadow";
import { GradientOutline } from "@/components/generic/GradientOutline";
import {
  CommandMenuIllustration,
  type CommandMenuSection,
} from "@/components/landing/CommandMenuIllustration";

const searchSections: CommandMenuSection[] = [
  {
    id: "documents",
    heading: "Quick results",
    items: [
      { id: "doc-1", label: "Japan Trip Planning", icon: "document" },
      { id: "doc-2", label: "Trip Master Plan", icon: "document" },
    ],
  },
];

export function FeatureSpotSearch() {
  return (
    <div
      role="img"
      aria-label="Search interface illustration showing quick document search results"
      className="w-full"
    >
      <CastShadow className="w-full relative">
        <GradientOutline />
        <CommandMenuIllustration
          query="trip"
          placeholder="Search documents..."
          sections={searchSections}
          showKeyboardHelp={false}
          className="h-[320px]"
        />
      </CastShadow>
    </div>
  );
}
