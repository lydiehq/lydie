import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";
import { SearchIllustration } from "../SearchIllustration";

const searchDocuments = [
  { label: "Japan Trip Planning", selected: true, icon: "document" as const },
  { label: "Trip Master Plan", selected: false, icon: "document" as const },
  { label: "Meeting notes", selected: false, icon: "document" as const },
];

export function FeatureSpotSearch() {
  return (
    <CastShadow className="w-full relative">
      <GradientOutline />
      <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white relative">
        <div className="absolute inset-0 flex flex-col">
          {/* Background content placeholder */}
          <div className="flex-1 p-8">
            <h1 className="text-2xl font-medium text-gray-900 mb-4">Project Notes</h1>
            <p className="text-gray-600 leading-relaxed">
              All your important documents and notes in one place. Use the command bar to quickly
              search through everything.
            </p>
          </div>

          {/* Search overlay */}
          <SearchIllustration
            query="trip"
            placeholder="Search documents..."
            sections={[
              {
                title: "Documents",
                items: searchDocuments,
              },
            ]}
            showKeyboardHelp={false}
            className="pt-8"
          />
        </div>
      </div>
    </CastShadow>
  );
}
