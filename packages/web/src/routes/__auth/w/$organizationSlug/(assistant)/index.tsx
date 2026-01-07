import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Surface } from "@/components/layout/Surface";
import { useMemo, useCallback } from "react";
import { useOrganization } from "@/context/organization.context";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatAlert } from "@/components/editor/ChatAlert";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";
import tippy from "tippy.js";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <AssistantChat />
      </Surface>
    </div>
  );
}

function AssistantChat() {
  const { organization } = useOrganization();
  const { messages, sendMessage, stop, status, alert, setAlert } =
    useAssistant();

  const [documents] = useQuery(
    queries.documents.byUpdated({ organizationId: organization.id })
  );

  const mentionDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents]
  );

  const mentionSuggestion = useMemo(() => {
    const mentionItems = mentionDocuments.map((doc) => ({
      id: doc.id,
      label: doc.title || "Untitled document",
      type: "document",
    }));

    return {
      allowSpaces: true,
      char: "@",
      items: ({ query }: { query: string }) => {
        return mentionItems
          .filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 10);
      },
      render() {
        let component: MentionList | null = null;
        let popup: any = null;

        return {
          onStart: (props: any) => {
            component = new MentionList({
              items: props.items,
              command: props.command,
            });

            if (!props.clientRect) {
              return;
            }

            popup = tippy("body", {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
            });
          },

          onUpdate(props: any) {
            component?.updateProps(props);

            if (!props.clientRect) {
              return;
            }

            if (popup && popup[0]) {
              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              });
            }
          },

          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === "Escape") {
              popup?.[0]?.hide();
              return true;
            }

            return component?.onKeyDown(props) ?? false;
          },

          onExit() {
            popup?.[0]?.destroy();
            component?.destroy();
          },
        };
      },
    };
  }, [mentionDocuments]);

  const handleSubmit = useCallback(
    (text: string) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
        },
      });
    },
    [sendMessage]
  );

  const canStop = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-full max-w-xl mx-auto">
      <div className="flex flex-col flex-1 min-h-0">
        {messages.length === 0 ? (
          <AssistantEmptyState
            mentionSuggestion={mentionSuggestion}
            onSubmit={handleSubmit}
          />
        ) : (
          <>
            <ChatMessages
              messages={messages}
              status={status as "submitted" | "streaming" | "ready" | "error"}
              editor={null}
              organizationId={organization.id}
            />
            <div className="p-3 relative shrink-0">
              <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
              <div className="z-10 relative">
                <ChatAlert
                  alert={alert}
                  onDismiss={() =>
                    setAlert(alert ? { ...alert, show: false } : null)
                  }
                />
                <AssistantInput
                  onSubmit={handleSubmit}
                  onStop={stop}
                  placeholder="Ask anything. Use @ to refer to documents"
                  mentionSuggestion={mentionSuggestion}
                  canStop={canStop}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantEmptyState({
  mentionSuggestion,
  onSubmit,
}: {
  mentionSuggestion: any;
  onSubmit: (text: string) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-xl w-full space-y-6 px-4">
        <div className="flex justify-center">
          <div className="bg-gray-50 rounded-full p-6">
            <MessageCircle size={48} className="text-gray-400" />
          </div>
        </div>
        <h1 className="text-xl font-medium text-gray-900">
          Ask anything about your documents...
        </h1>
        <AssistantInput
          onSubmit={onSubmit}
          placeholder="Ask anything about your documents..."
          mentionSuggestion={mentionSuggestion}
        />
      </div>
    </div>
  );
}

class MentionList {
  items: any[];
  command: any;
  element: HTMLElement;
  selectedIndex: number;

  constructor({ items, command }: { items: any[]; command: any }) {
    this.items = items;
    this.command = command;
    this.selectedIndex = 0;

    this.element = document.createElement("div");
    this.element.className =
      "bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-60 overflow-y-auto z-50";
    this.render();
  }

  render() {
    this.element.innerHTML = "";

    this.items.forEach((item, index) => {
      const itemElement = document.createElement("div");
      itemElement.className = `px-3 py-2 cursor-pointer rounded text-sm ${
        index === this.selectedIndex
          ? "bg-blue-100 text-blue-800"
          : "text-gray-700 hover:bg-gray-100"
      }`;
      itemElement.textContent = item.label;
      itemElement.addEventListener("click", () => {
        this.command(item);
      });
      this.element.appendChild(itemElement);
    });
  }

  updateProps(props: any) {
    this.items = props.items;
    this.selectedIndex = 0;
    this.render();
  }

  onKeyDown({ event }: { event: KeyboardEvent }) {
    if (event.key === "ArrowUp") {
      this.selectedIndex =
        (this.selectedIndex + this.items.length - 1) % this.items.length;
      this.render();
      return true;
    }

    if (event.key === "ArrowDown") {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.render();
      return true;
    }

    if (event.key === "Enter") {
      this.command(this.items[this.selectedIndex]);
      return true;
    }

    return false;
  }

  destroy() {
    this.element.remove();
  }
}
