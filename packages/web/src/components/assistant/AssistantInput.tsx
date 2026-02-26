import { ArrowCircleUp32Filled, SquareFilled } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { EditorContent } from "@tiptap/react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form } from "react-aria-components";

import { AgentSelector } from "@/components/assistant/AgentSelector";
import { ModelSelector } from "@/components/assistant/ModelSelector";
import { type ChatContextItem, ChatContextList } from "@/components/chat/ChatContextList";
import { useAssistantPreferences } from "@/context/assistant-preferences.context";
import { useDocumentContext } from "@/hooks/use-document-context";
import { useAssistantEditor } from "@/lib/editor/assistant-editor";
import { getReferenceDocumentIds } from "@/utils/parse-references";

export interface AssistantInputProps {
  onSubmit: (text: string, contextDocumentIds: string[]) => void;
  onStop?: () => void;
  canStop?: boolean;
  initialPrompt?: string;
  currentDocumentId?: string | null;
  onRemoveContext?: (item: ChatContextItem) => void;
  editorClassName?: string;
  variant?: "rounded" | "flat";
  content?: string;
  showAgentSelector?: boolean;
  showModelSelector?: boolean;
}

export function AssistantInput({
  onSubmit,
  onStop,
  canStop = false,
  initialPrompt,
  currentDocumentId,
  onRemoveContext,
  editorClassName,
  content,
  showAgentSelector = true,
  showModelSelector = true,
}: AssistantInputProps) {
  const { selectedAgentId, setSelectedAgentId, selectedModelId, setSelectedModelId } =
    useAssistantPreferences();
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
    if (!assistantEditor.editor) {
      return;
    }

    if (content !== undefined && content !== null) {
      const currentContent = assistantEditor.getTextContent();
      if (content !== currentContent) {
        assistantEditor.setContent(content);
      }
      return;
    }

    if (initialPrompt && !assistantEditor.getTextContent()) {
      assistantEditor.setContent(initialPrompt);
    }
  }, [content, initialPrompt, assistantEditor]);

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

  return (
    <motion.div
      className="rounded-2xl flex flex-col z-10 relative bg-gray-100 p-1 gap-y-0.5 w-full"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      initial={false}
    >
      <ChatContextList
        items={contextItems}
        onRemove={handleRemoveContext}
        availableDocuments={availableDocuments}
        onAddDocument={handleAddDocument}
      />
      <div className="flex flex-col bg-white rounded-2xl p-2 relative shadow-surface">
        <Form className="relative flex flex-col" onSubmit={handleSubmit}>
          <EditorContent editor={assistantEditor.editor} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {showAgentSelector && (
                <AgentSelector
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                />
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {showModelSelector && (
                <ModelSelector
                  selectedModelId={selectedModelId}
                  onSelectModel={setSelectedModelId}
                />
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
                  <ArrowCircleUp32Filled className="size-5 text-gray-900" />
                )}
              </Button>
            </div>
          </div>
        </Form>
      </div>
    </motion.div>
  );
}
