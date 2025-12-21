import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, CircleArrowUp, Square } from "lucide-react";
import { Surface } from "@/components/layout/Surface";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState, useRef } from "react";
import { createId } from "@lydie/core/id";
import { useOrganization } from "@/context/organization.context";
import { useAuth } from "@/context/auth.context";
import { useZero } from "@/services/zero";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useChatComposer } from "@/components/chat/useChatComposer";
import {
  LLMMessages,
  type LLMMessageWithMetadata,
} from "@/components/chat/LLMMessages";
import { EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Form, Button as RACButton } from "react-aria-components";
import { ChatAlert, type ChatAlertState } from "@/components/editor/ChatAlert";
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler";
import { useRouter } from "@tanstack/react-router";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { PanelResizer } from "@/components/panels/PanelResizer";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import clsx from "clsx";
import { mutators } from "@lydie/zero/mutators";

export const Route = createFileRoute("/__auth/w/$organizationId/assistant")({
  component: AssistantPage,
});

function AssistantPage() {
  const { organization } = useOrganization();
  // Note: If we have a fresh page load, we default to a new conversation.
  const [conversationId, setConversationId] = useState(() => createId());

  const [conversations] = useQuery(
    queries.assistant.conversations({ organizationId: organization?.id || "" })
  );

  const selectedConversation = useMemo(
    () => conversations?.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      panel.isCollapsed() ? panel.expand() : panel.collapse();
    }
  };

  const handleNewChat = () => {
    setConversationId(createId());
  };

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <PanelGroup direction="horizontal" autoSaveId="assistant-panel-group">
          <Panel>
            <AssistantChat
              key={conversationId}
              conversationId={conversationId}
              selectedConversation={selectedConversation}
              organizationId={organization?.id || ""}
            />
          </Panel>
          <PanelResizer className="w-1 bg-gray-100 hover:bg-gray-200 cursor-col-resize transition-colors" />
          <Panel
            ref={sidebarPanelRef}
            defaultSize={20}
            minSize={15}
            maxSize={30}
            collapsible
            collapsedSize={4}
            onCollapse={() => setIsCollapsed(true)}
            onExpand={() => setIsCollapsed(false)}
            className={clsx("transition-all", isCollapsed && "min-w-[50px]")}
          >
            <AssistantSidebar
              conversations={conversations || []}
              currentConversationId={conversationId}
              onSelect={setConversationId}
              onNewChat={handleNewChat}
              isCollapsed={isCollapsed}
              onToggle={toggleSidebar}
            />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  );
}

function AssistantChat({
  conversationId,
  selectedConversation,
  organizationId,
}: {
  conversationId: string;
  selectedConversation: any;
  organizationId: string;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const [alert, setAlert] = useState<ChatAlertState | null>(null);
  const z = useZero();

  const [documents] = useQuery(queries.documents.byUpdated({ organizationId }));

  const mentionDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents]
  );

  const chatComposer = useChatComposer({
    documents: mentionDocuments,
    onEnter: () => {
      const textContent = chatComposer.getTextContent();
      if (textContent.trim()) {
        handleSubmit();
      }
    },
  });

  const { messages, sendMessage, stop, status, addToolOutput } =
    useChat<LLMMessageWithMetadata>({
      id: conversationId,
      messages: selectedConversation?.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })),
      transport: new DefaultChatTransport({
        api:
          import.meta.env.VITE_API_URL.replace(/\/+$/, "") +
          "/internal/assistant",
        credentials: "include",
        body: {
          conversationId,
        },
        headers: {
          "X-Organization-Id": organizationId,
        },
      }),
      async onToolCall({ toolCall }) {
        if (toolCall.toolName === "createDocument") {
          const args = (toolCall as any).args ?? (toolCall as any).input;
          const { title, content } = args as {
            title?: string;
            content?: string;
          };
          const id = createId();

          let jsonContent;

          if (content) {
            // Create a temporary editor to parse HTML to JSON.
            // TODO: use our own utils for this
            const tempEditor = new Editor({
              content: content,
              extensions: [StarterKit],
            });
            jsonContent = tempEditor.getJSON();
            tempEditor.destroy();
          }

          z.mutate(
            mutators.document.create({
              id,
              organizationId: organizationId,
              title: title || "Untitled",
              folderId: undefined,
              jsonContent: jsonContent as any, // Cast to any as Zero schema expects specific JSON structure
            })
          );

          addToolOutput({
            toolCallId: toolCall.toolCallId,
            tool: "createDocument",
            output: {
              id,
              title: title || "Untitled",
              snippet: content,
              message: "Document created.",
            },
          });

          // Don't navigate automatically
        }
      },
      onError: (error) => {
        console.error("Assistant chat error:", error);
        const { message } = parseChatError(error);

        if (isUsageLimitError(error)) {
          setAlert({
            show: true,
            type: "error",
            title: "Daily Limit Reached",
            message,
            action: {
              label: "Upgrade to Pro →",
              onClick: () => {
                router.navigate({
                  to: "/w/$organizationId/settings/billing",
                  params: { organizationId },
                });
              },
            },
          });
        } else {
          setAlert({
            show: true,
            type: "error",
            title: "Something went wrong",
            message,
          });
        }
      },
    });

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const textContent = chatComposer.getTextContent();
    if (!textContent.trim()) return;

    sendMessage({
      text: textContent,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
    chatComposer.clearContent();
  };

  const canStop = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 min-h-0">
        {messages.length === 0 ? (
          <AssistantEmptyState
            onSuggestionClick={(text) => chatComposer.setContent(text)}
          />
        ) : (
          <LLMMessages
            messages={messages}
            status={status}
            editor={null}
            organizationId={organizationId}
          />
        )}

        <div className="p-3 relative shrink-0">
          <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
          <div className="rounded-lg bg-white ring-1 ring-black/10 p-2 flex flex-col gap-y-2 z-10 relative">
            <ChatAlert
              alert={alert}
              onDismiss={() =>
                setAlert((prev) => (prev ? { ...prev, show: false } : null))
              }
            />

            <Form className="relative flex flex-col" onSubmit={handleSubmit}>
              <EditorContent editor={chatComposer.editor} />
              <RACButton
                type={canStop ? "button" : "submit"}
                onPress={canStop ? stop : undefined}
                className="p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"
                isDisabled={false}
              >
                {canStop ? (
                  <Square className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <CircleArrowUp className="size-4.5 text-gray-500" />
                )}
              </RACButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantEmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  const suggestions = [
    "Show me all documents that mention coffee",
    "What are my recent meeting notes about?",
    "Find documents related to project planning",
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-3">
        <div className="flex justify-center">
          <div className="bg-gray-50 rounded-full p-6">
            <MessageCircle size={48} className="text-gray-400" />
          </div>
        </div>
        <h2 className="text-xl font-medium text-gray-900">
          Welcome to your Assistant
        </h2>
        <p className="text-gray-600">
          I can help you search through your documents, answer questions about
          your content, and assist with various tasks across your workspace.
        </p>
        <div className="mt-4 space-y-1 text-sm text-gray-500">
          <p>Try asking:</p>
          <ul className="space-y-1">
            {suggestions.map((suggestion, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onSuggestionClick(suggestion)}
                  className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  "{suggestion}"
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
