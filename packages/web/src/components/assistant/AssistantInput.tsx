import { EditorContent } from "@tiptap/react";
import { Button, Form } from "react-aria-components";
import { motion } from "motion/react";
import { ChevronUp, Square } from "lucide-react";
import { useChatEditor } from "@/lib/editor/chat-editor";
import { useCallback, useRef } from "react";

export interface AssistantInputProps {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  placeholder?: string;
  mentionSuggestion?: any;
  canStop?: boolean;
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  mentionSuggestion,
  canStop = false,
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

  return (
    <motion.div
      layoutId="assistant-input"
      className="rounded-full bg-white text-sm ring-1 ring-black/10 flex flex-col gap-y-2 relative"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
          className="size-9 justify-center items-center flex bottom-1.5 right-1.5 absolute rounded-full border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 hover:before:bg-white/6 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 bg-gray-800 text-white after:mix-blend-overlay"
          isDisabled={false}
        >
          {canStop ? (
            <Square className="size-4 text-white fill-white" />
          ) : (
            <ChevronUp className="size-4.5 text-white" />
          )}
        </Button>
      </Form>
    </motion.div>
  );
}
