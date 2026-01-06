import { EditorContent } from "@tiptap/react";
import { Button, Form } from "react-aria-components";
import { motion } from "motion/react";
import { CircleArrowUp, Square } from "lucide-react";
import { useChatEditor } from "@/lib/editor/chat-editor";
import { useCallback, useRef } from "react";

export interface AssistantInputProps {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  placeholder?: string;
  mentionSuggestion?: any;
  canStop?: boolean;
  showSuggestions?: boolean;
  suggestions?: string[];
  layoutId?: string;
  className?: string;
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  mentionSuggestion,
  canStop = false,
  showSuggestions = false,
  suggestions = [],
  layoutId = "assistant-input",
  className = "",
}: AssistantInputProps) {
  const handleSubmitRef = useRef<() => void>(() => {});

  const chatEditor = useChatEditor({
    placeholder,
    mentionSuggestion,
    onEnter: () => {
      const textContent = chatEditor.getTextContent();
      if (textContent.trim()) {
        handleSubmitRef.current();
      }
    },
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      const textContent = chatEditor.getTextContent();
      if (!textContent.trim()) return;

      onSubmit(textContent);
      chatEditor.clearContent();
    },
    [chatEditor, onSubmit]
  );

  // Assign to ref so it can be called from onEnter callback
  handleSubmitRef.current = handleSubmit;

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      onSubmit(suggestion);
    },
    [onSubmit]
  );

  return (
    <div className={`flex flex-col gap-y-2 ${className}`}>
      <motion.div
        layoutId={layoutId}
        className="rounded-full bg-white text-sm ring-1 ring-black/10 px-4 py-2 flex flex-col gap-y-2 relative"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        animate={{}}
        initial={false}
      >
        <Form className="relative flex flex-col" onSubmit={handleSubmit}>
          <EditorContent
            editor={chatEditor.editor}
            className="text-sm text-start"
          />
          <Button
            type={canStop ? "button" : "submit"}
            onPress={canStop ? onStop : undefined}
            className="p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"
            isDisabled={false}
          >
            {canStop ? (
              <Square className="size-4 text-gray-900 fill-gray-900" />
            ) : (
              <CircleArrowUp className="size-4.5 text-gray-500" />
            )}
          </Button>
        </Form>
      </motion.div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="flex gap-2">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              className="rounded-full text-xs text-gray-700 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 transition-colors"
              onPress={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
