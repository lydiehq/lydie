import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";
import { CommandMenuIllustration } from "../CommandMenuIllustration";
import { SearchIllustration } from "../SearchIllustration";

const searchSections = [
  {
    id: "documents",
    heading: "Quick results",
    items: [
      { id: "doc-1", label: "Japan Trip Planning", icon: "document" as const },
      { id: "doc-2", label: "Trip Master Plan", icon: "document" as const },
      { id: "doc-3", label: "Meeting notes", icon: "document" as const },
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
