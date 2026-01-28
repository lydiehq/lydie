import { ArrowCircleUpRegular, ChevronUpRegular, SquareFilled } from "@fluentui/react-icons";
import { EditorContent } from "@tiptap/react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form } from "react-aria-components";

import { AgentSelector } from "@/components/assistant/AgentSelector";
import { type ChatContextItem, ChatContextList } from "@/components/chat/ChatContextList";
import { Button } from "@lydie/ui/components/generic/Button";
import { useDocumentContext } from "@/hooks/use-document-context";
import { useAssistantEditor } from "@/lib/editor/assistant-editor";
import { getReferenceDocumentIds } from "@/utils/parse-references";

export interface AssistantInputProps {
  onSubmit: (text: string, contextDocumentIds: string[]) => void;
  onStop?: () => void;
  placeholder?: string;
  canStop?: boolean;
  initialPrompt?: string;
  currentDocumentId?: string | null;
  onRemoveContext?: (item: ChatContextItem) => void;
  editorClassName?: string;
  variant?: "rounded" | "flat";
  content?: string;
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  canStop = false,
  initialPrompt,
  currentDocumentId,
  onRemoveContext,
  editorClassName = "focus:outline-none text-sm text-gray-700 px-5 py-3.5",
  variant = "rounded",
  content,
  selectedAgentId,
  onSelectAgent,
}: AssistantInputProps) {
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([]);
  const [manuallySelectedDocumentIds, setManuallySelectedDocumentIds] = useState<string[]>([]);

  const allReferencedDocumentIds = useMemo(() => {
    return Array.from(new Set([...mentionedDocumentIds, ...manuallySelectedDocumentIds]));
  }, [mentionedDocumentIds, manuallySelectedDocumentIds]);

  const {
    availableDocuments,
    contextItems: baseContextItems,
    contextDocumentIds,
    handleRemoveContext: defaultHandleRemoveContext,
    resetDismissal,
  } = useDocumentContext({
    currentDocumentId,
    mentionedDocumentIds: allReferencedDocumentIds,
  });

  const handleSubmitRef = useRef<() => void>(() => {});

  const assistantEditor = useAssistantEditor({
    documents: availableDocuments,
    placeholder,
    editorClassName,
    onChange: (editor) => {
      const textContent = editor.getText();
      setMentionedDocumentIds(getReferenceDocumentIds(textContent));
    },
    onEnter: () => {
      const textContent = assistantEditor.getTextContent();
      if (textContent.trim()) {
        handleSubmitRef.current();
      }
    },
  });

  useEffect(() => {
    if (initialPrompt && assistantEditor.editor && !assistantEditor.getTextContent()) {
      assistantEditor.setContent(initialPrompt);
    }
  }, [initialPrompt, assistantEditor]);

  useEffect(() => {
    if (content !== undefined && content !== null && assistantEditor.editor) {
      const currentContent = assistantEditor.getTextContent();
      if (content !== currentContent) {
        assistantEditor.setContent(content);
      }
    }
  }, [content, assistantEditor]);

  // Enhance context items to mark manually selected documents
  const contextItems = useMemo(() => {
    return baseContextItems.map((item) => {
      if (item.source === "mention" && manuallySelectedDocumentIds.includes(item.id)) {
        return {
          ...item,
          source: "manual" as const,
          removable: true,
        };
      }
      return item;
    });
  }, [baseContextItems, manuallySelectedDocumentIds]);

  const handleAddDocument = useCallback((documentId: string) => {
    setManuallySelectedDocumentIds((prev) => [...prev, documentId]);
  }, []);

  const handleRemoveContext = useCallback(
    (item: ChatContextItem) => {
      // If it's a manually selected document, remove it from manual selection
      if (manuallySelectedDocumentIds.includes(item.id)) {
        setManuallySelectedDocumentIds((prev) => prev.filter((id) => id !== item.id));
      }
      // Also call the default or custom handler
      if (onRemoveContext) {
        onRemoveContext(item);
      } else {
        defaultHandleRemoveContext(item);
      }
    },
    [manuallySelectedDocumentIds, onRemoveContext, defaultHandleRemoveContext],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      const textContent = assistantEditor.getTextContent();
      if (!textContent.trim()) return;

      onSubmit(textContent, contextDocumentIds);
      assistantEditor.clearContent();
      resetDismissal();
      setManuallySelectedDocumentIds([]);
    },
    [assistantEditor, onSubmit, contextDocumentIds, resetDismissal],
  );

  handleSubmitRef.current = handleSubmit;

  const containerClassName =
    variant === "rounded"
      ? "rounded-full bg-white text-sm shadow-surface flex flex-col gap-y-2 relative w-full"
      : "rounded-lg flex flex-col z-10 relative bg-gray-100 p-1 gap-y-0.5";

  const formClassName = variant === "rounded" ? "relative flex flex-col" : "relative flex flex-col";

  const editorWrapperClassName =
    variant === "rounded"
      ? "text-sm text-start"
      : "flex flex-col bg-white rounded-[6px] p-2 relative shadow-surface";

  return (
    <motion.div
      layoutId={variant === "rounded" ? "assistant-input" : undefined}
      className={containerClassName}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      initial={false}
    >
      {variant === "flat" && (
        <ChatContextList
          items={contextItems}
          onRemove={handleRemoveContext}
          availableDocuments={availableDocuments}
          onAddDocument={handleAddDocument}
        />
      )}
      <div className={variant === "flat" ? editorWrapperClassName : ""}>
        <Form className={formClassName} onSubmit={handleSubmit}>
          {variant === "rounded" && (
            <ChatContextList
              items={contextItems}
              onRemove={handleRemoveContext}
              availableDocuments={availableDocuments}
              onAddDocument={handleAddDocument}
            />
          )}
          <EditorContent
            editor={assistantEditor.editor}
            className={variant === "rounded" ? "text-sm text-start" : ""}
          />
          {variant === "flat" ? (
            <div className="flex items-center justify-between">
              {selectedAgentId !== undefined && onSelectAgent && (
                <AgentSelector selectedAgentId={selectedAgentId} onSelectAgent={onSelectAgent} />
              )}
              <Button
                type={canStop ? "button" : "submit"}
                onPress={canStop ? onStop : undefined}
                intent="ghost"
                size="icon-sm"
              >
                {canStop ? (
                  <SquareFilled className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <ArrowCircleUpRegular className="size-4.5 text-gray-500" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              type={canStop ? "button" : "submit"}
              onPress={canStop ? onStop : undefined}
              intent="primary"
              size="icon-lg"
              rounded
              className="bottom-1.5 right-1.5 absolute"
            >
              {canStop ? (
                <SquareFilled className="size-3 text-white fill-white" />
              ) : (
                <ChevronUpRegular className="size-4 text-white" />
              )}
            </Button>
          )}
        </Form>
      </div>
    </motion.div>
  );
}
