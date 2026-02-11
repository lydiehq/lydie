import { ChevronRight12Filled } from "@fluentui/react-icons";

import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";
import { AssistantMessage, UserMessage } from "../demo/AssistantDemo";

export function FeatureSpotAI() {
  return (
    <div className="flex flex-col gap-y-4 relative p-4 border border-outline-subtle rounded-xl w-full ">
      <GradientOutline />
      <UserMessage content="Create a project brief from my Q4 Planning doc and Goals 2025" />
      <div className="flex flex-col gap-y-2">
        <span className="text-sm text-gray-500 leading-relaxed">Read 2 documents...</span>
        <span className="text-sm text-gray-500 leading-relaxed">
          Searched workspace for &quot;Q4 Planning&quot; and &quot;Goals 2025&quot;
        </span>
        <span className="text-sm text-gray-500 leading-relaxed">
          Created new document <span className="font-medium text-gray-900">Q4 Project Brief</span>
          <ChevronRight12Filled className="size-3 text-gray-500 ml-1 inline" />
        </span>
      </div>
      <AssistantMessage content="I've created new document Q4 Project Brief with your research findings and timeline. Ready for review." />
      <UserMessage content="Thanks!" />
    </div>
  );
}
