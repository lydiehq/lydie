import { CastShadow } from "../../generic/CastShadow";
import { Logo } from "../../Logo";

export interface Message {
  id: string;
  type: "user" | "assistant" | "tool-call" | "tool-result";
  content: string;
  toolName?: string;
  status?: "pending" | "complete";
}

type UserMessageProps = {
  content: string;
  className?: string;
};

type AssistantMessageProps = {
  content: string;
  className?: string;
};

export function UserMessage({ content }: UserMessageProps) {
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

export function AssistantMessage({ content }: AssistantMessageProps) {
  return (
    <div className="flex self-start justify-start max-w-[85%] flex-col gap-y-1.5">
      <CastShadow height={20} strength={0.2}>
        <div className=" bg-white ring ring-black/4 shadow-md rounded-2xl rounded-tl-md px-3 py-2 text-sm text-gray-600 leading-relaxed">
          {content}
        </div>
      </CastShadow>
    </div>
  );
}

type AssistantDemoProps = {
  messages: Message[];
  showInput?: boolean;
  className?: string;
  messagesClassName?: string;
  inputClassName?: string;
};

export function AssistantDemo({
  messages,
  showInput = true,
  className = "",
  messagesClassName = "",
  inputClassName = "",
}: AssistantDemoProps) {
  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 ${messagesClassName}`}>
        {messages.map((message) => (
          <MessageComponent key={message.id} message={message} />
        ))}
      </div>

      {showInput && (
        <div className={`p-3 bg-gray-50/50 ${inputClassName}`}>
          <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2.5 ring-1 ring-black/5">
            <input
              type="text"
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 text-gray-900"
              readOnly
            />
            <button className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageComponent({ message }: { message: Message }) {
  if (message.type === "user") {
    return <UserMessage content={message.content} />;
  }

  if (message.type === "assistant") {
    return <AssistantMessage content={message.content} />;
  }

  if (message.type === "tool-call") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-3 border border-gray-200">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-500 shrink-0">{message.toolName}</span>
            <span className="text-sm text-gray-700 truncate">{message.content}</span>
          </div>
          {message.status === "complete" && (
            <svg
              className="size-4 shrink-0 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return null;
}
