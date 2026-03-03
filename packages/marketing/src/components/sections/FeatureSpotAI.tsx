import { BotRegular, ChevronRight12Filled } from "@fluentui/react-icons";

import { CastShadow } from "@/components/generic/CastShadow";
import { GradientOutline } from "@/components/generic/GradientOutline";

type MessageProps = {
  content: string;
  className?: string;
};

function UserMessage({ content }: MessageProps) {
  return (
    <div className="flex self-end justify-end max-w-[85%]">
      <CastShadow height={20} strength={0.2}>
        <div className="bg-white shadow-md ring ring-black/4 rounded-2xl rounded-tr-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
          {content}
        </div>
      </CastShadow>
    </div>
  );
}

function AssistantMessage({ content }: MessageProps) {
  return (
    <div className="flex self-start justify-start max-w-[85%] flex-col gap-y-1.5">
      <div className="flex items-center gap-x-1.5">
        <div className="rounded-full size-6 ring ring-outline-subtle flex items-center justify-center">
          <BotRegular className="size-4 text-black/30" />
        </div>
        <span className="text-[0.8125rem] text-gray-500">Assistant</span>
      </div>
      <div className="flex self-start justify-start max-w-[85%] flex-col gap-y-1.5">
        <CastShadow height={20} strength={0.2}>
          <div className=" bg-white ring ring-black/4 shadow-md rounded-2xl rounded-tl-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
            {content}
          </div>
        </CastShadow>
      </div>
    </div>
  );
}

export function FeatureSpotAI() {
  return (
    <div
      className="flex flex-col relative w-full"
      role="img"
      aria-label="AI assistant interface illustration showing chat messages and document creation"
    >
      {/* <GradientOutline /> */}
      <div className="flex flex-col gap-y-4 p-1.5">
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
    </div>
  );
}
