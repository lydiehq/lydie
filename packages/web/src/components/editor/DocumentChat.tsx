import { Editor, EditorContent, useEditorState } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { Button as RACButton, Form } from "react-aria-components";
import { CircleArrowUp, X, Square } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { queries } from "@lydie/zero/queries";
import { type DocumentEditorHookResult } from "@/lib/editor/document-editor";
import { applyContentChanges } from "@/utils/document-changes";
import { ChatMessages } from "@/components/chat/ChatMessages";
import {
  useMemo,
  useState,
  useImperativeHandle,
  type ForwardedRef,
} from "react";
import { createId } from "@lydie/core/id";
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";
import { useSelectedContent } from "@/context/selected-content.context";
import { useQuery } from "@rocicorp/zero/react";
import { useOrganization } from "@/context/organization.context";
import type { QueryResultType } from "@rocicorp/zero";
import { useRouter } from "@tanstack/react-router";
import { ChatAlert, type ChatAlertState } from "./ChatAlert";
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler";
import { useChatComposer } from "@/components/chat/useChatComposer";

export type DocumentChatRef = {
  focus: () => void;
};

type Props = {
  contentEditor: DocumentEditorHookResult;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  conversation: NonNullable<
    QueryResultType<typeof queries.documents.byId>
  >["conversations"][number];
  ref: ForwardedRef<DocumentChatRef>;
};

export function DocumentChat({ contentEditor, doc, conversation, ref }: Props) {
  const { focusedContent, clearFocusedContent } = useSelectedContent();
  const { organization } = useOrganization();
  const router = useRouter();
  const [alert, setAlert] = useState<ChatAlertState | null>(null);

  const [documents] = useQuery(
    queries.documents.byUpdated({ organizationId: organization.id })
  );

  const availableDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents]
  );

  const conversationId = useMemo(() => {
    return conversation?.id || createId();
  }, [conversation?.id]);

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    onEnter: () => {
      const textContent = chatEditor.getTextContent();
      if (textContent.trim()) {
        handleSubmit();
      }
    },
  });

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (chatEditor.editor) {
        chatEditor.editor.commands.focus();
      }
    },
  }));

  const editorState = useEditorState({
    editor: contentEditor.editor,
    selector: (state) => {
      return {
        wordCount: state.editor.storage.characterCount.words(),
      };
    },
  });

  const { messages, sendMessage, stop, status } =
    useChat<DocumentChatAgentUIMessage>({
      experimental_throttle: 100,
      transport: new DefaultChatTransport({
        api:
          import.meta.env.VITE_API_URL.replace(/\/+$/, "") +
          "/internal/document-chat",
        credentials: "include",
        body: {
          documentId: doc.id,
          conversationId: conversationId,
          documentWordCount: editorState.wordCount,
        },
        headers: {
          "X-Organization-Id": doc.organization_id,
        },
      }),
      // @ts-expect-error - TODO: fix this
      messages: conversation?.messages.map(
        (
          msg: NonNullable<
            QueryResultType<typeof queries.documents.byId>
          >["conversations"][number]["messages"][number]
        ) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })
      ),
      onError: (error) => {
        const { message } = parseChatError(error);

        // Show usage limit errors with upgrade action
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
                  to: "/w/$organizationSlug/settings/billing",
                  params: { organizationId: organization.id },
                });
              },
            },
          });
        } else {
          // Show all other errors in the alert drawer
          setAlert({
            show: true,
            type: "error",
            title: "Error",
            message,
          });
        }
      },
    });

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const textContent = chatEditor.getTextContent();
    if (!textContent.trim()) return;

    sendMessage({
      text: textContent,
    });
    chatEditor.clearContent();
    clearFocusedContent();
    contentEditor.editor?.commands.clearSelection();
  };

  const applyContent = async (
    edits: {
      changes?: Array<{
        search: string;
        replace: string;
        overwrite?: boolean;
      }>;
      title?: string;
      message?: string;
    },
    onProgress?: (current: number, total: number, usedLLM: boolean) => void
  ) => {
    try {
      if (!contentEditor.editor) {
        throw new Error("Content editor not available for applying changes");
      }

      let result: {
        success: boolean;
        error?: string;
        appliedChanges?: number;
        usedLLMFallback?: boolean;
      } = { success: true };

      if (edits.changes && edits.changes.length > 0) {
        result = await applyContentChanges(
          contentEditor.editor,
          edits.changes,
          organization.id,
          onProgress
        );

        // Log if LLM fallback was used
        if (result.usedLLMFallback) {
          console.info("✨ LLM-assisted replacement was used for this change");
        }
      }

      // Note: Title editing is now handled separately via the title input field

      if (!result.success) {
        throw new Error(result.error || "Failed to apply content changes");
      }
    } catch (error) {
      console.error("Error applying content:", error);
    }
  };

  const canStop = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col overflow-hidden grow">
      <ChatMessages
        messages={messages}
        onApplyContent={applyContent}
        status={status}
        editor={contentEditor.editor}
        organizationId={organization.id}
      />
      <div className="p-3 relative">
        <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
        <div className="rounded-lg bg-white p-2 flex flex-col gap-y-2 z-10 relative shadow-surface">
          <AnimatePresence mode="sync">
            {alert && (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <ChatAlert alert={alert} onDismiss={() => setAlert(null)} />
              </motion.div>
            )}
            {focusedContent ? (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <Selection editor={contentEditor.editor} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-col">
            <Form className="relative flex flex-col" onSubmit={handleSubmit}>
              <EditorContent editor={chatEditor.editor} />
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

function Selection({ editor }: { editor: Editor | null }) {
  const { focusedContent, clearFocusedContent } = useSelectedContent();

  const handleClearSelection = () => {
    if (editor) {
      editor.commands.clearSelection();
      clearFocusedContent();
    }
  };

  const jumpToSelection = () => {
    if (editor) {
      editor.commands.jumpToSelection();
    }
  };

  return (
    <div className="flex items-center overflow-hidden bg-gray-50">
      <RACButton
        onPress={handleClearSelection}
        className="text-gray-500 hover:text-gray-700 p-1 rounded rounded-l-md"
      >
        <X className="size-3.5" />
      </RACButton>
      <RACButton
        className="p-1 rounded relative flex-1 text-sm leading-relaxed text-gray-700 truncate italic transition-colors hover:bg-gray-100 rounded-r-md text-start"
        onPress={jumpToSelection}
      >
        "{focusedContent}"
      </RACButton>
    </div>
  );
}
