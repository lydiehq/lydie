import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState, useMemo } from "react";
import { EditorContent } from "@tiptap/react";
import { Form, Button as RACButton, Button } from "react-aria-components";
import { CircleArrowUpIcon, SquareIcon, AsteriskIcon } from "@/icons";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatAlert } from "@/components/editor/ChatAlert";
import { useFloatingAssistant } from "@/context/floating-assistant.context";
import { useOrganization } from "@/context/organization.context";
import { AssistantProvider, useAssistant } from "@/context/assistant.context";
import { useChatComposer } from "@/components/chat/useChatComposer";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { XIcon } from "lucide-react";

export function FloatingAssistant() {
  const { isOpen, close, toggle, initialPrompt, clearPrompt } = useFloatingAssistant();
  const { organization } = useOrganization();

  return (
    <>
      {!isOpen && (
        <motion.div
          layoutId="floating-assistant"
          className="fixed right-4 bottom-4 z-50"
          initial={false}
          transition={{ type: "spring", stiffness: 450, damping: 35 }}
        >
          <RACButton
            onPress={toggle}
            className="bg-white shadow-surface rounded-full size-10 justify-center items-center flex hover:bg-gray-50 transition-colors"
          >
            <AsteriskIcon className="size-4 text-gray-600" />
          </RACButton>
        </motion.div>
      )}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            layoutId="floating-assistant"
            initial={false}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className="fixed right-4 bottom-4 w-[400px] h-[540px] bg-white rounded-xl ring ring-black/8 shadow-lg flex flex-col overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-medium text-gray-900">AI Assistant</h2>
              <Button
                onPress={close}
                className="p-1 hover:bg-gray-200 rounded-md transition-colors"
              >
                <XIcon className="size-4 text-gray-600" />
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <AssistantProvider organizationId={organization.id}>
                <FloatingAssistantChatContent
                  organizationId={organization.id}
                  initialPrompt={initialPrompt}
                  onPromptUsed={clearPrompt}
                />
              </AssistantProvider>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function FloatingAssistantChatContent({
  organizationId,
  initialPrompt,
  onPromptUsed,
}: {
  organizationId: string;
  initialPrompt?: string;
  onPromptUsed?: () => void;
}) {
  const {
    messages,
    sendMessage,
    stop,
    status,
    alert,
    setAlert,
  } = useAssistant();
  const { organization } = useOrganization();
  const [currentInitialPrompt, setCurrentInitialPrompt] = useState<string | undefined>(
    initialPrompt
  );

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

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    onEnter: () => {
      const textContent = chatEditor.getTextContent();
      if (textContent.trim()) {
        handleSubmit();
      }
    },
    placeholder: "Ask anything. Use @ to refer to documents",
  });

  // Set initial prompt if provided
  useEffect(() => {
    if (initialPrompt && chatEditor.editor && !chatEditor.getTextContent()) {
      chatEditor.setContent(initialPrompt);
    }
  }, [initialPrompt, chatEditor]);

  // Clear prompt after it's been used
  useEffect(() => {
    if (currentInitialPrompt && initialPrompt !== currentInitialPrompt) {
      setCurrentInitialPrompt(initialPrompt);
    }
  }, [initialPrompt, currentInitialPrompt]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      const textContent = chatEditor.getTextContent();
      if (!textContent.trim()) return;

      sendMessage({
        text: textContent,
        metadata: {
          createdAt: new Date().toISOString(),
        },
      });

      chatEditor.clearContent();

      // Clear the initial prompt after first submission
      if (currentInitialPrompt) {
        setCurrentInitialPrompt(undefined);
        onPromptUsed?.();
      }
    },
    [sendMessage, chatEditor, currentInitialPrompt, onPromptUsed]
  );

  const canStop = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col overflow-hidden grow h-full">
      <ChatMessages
        messages={messages}
        status={status as "submitted" | "streaming" | "ready" | "error"}
        editor={null}
        organizationId={organizationId}
      />
      <div className="p-1.5 relative">
        <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
        <div className="rounded-lg p-2 flex flex-col gap-y-2 z-10 relative bg-gray-100 ring ring-black/8">
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
                <ChatAlert
                  alert={alert}
                  onDismiss={() => setAlert(null)}
                />
              </motion.div>
            )}
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
                  <SquareIcon className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <CircleArrowUpIcon className="size-4.5 text-gray-500" />
                )}
              </RACButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
