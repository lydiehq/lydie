import type { Editor } from "@tiptap/core";

import { useEditorState } from "@tiptap/react";

type Props = {
  editor: Editor;
};

export function BottomBar({ editor }: Props) {
  const editorState = useEditorState({
    editor,
    selector: (state) => {
      return {
        wordCount: state.editor.storage.characterCount.words(),
        characterCount: state.editor.storage.characterCount.characters(),
      };
    },
  });

  return (
    <div className="absolute bottom-3 left-3 z-50">
      <div className="flex gap-x-4">
        {/* <span className="text-xs text-gray-500">Characters: {editorState.characterCount}</span> */}
        <span className="text-xs text-gray-400">Words: {editorState.wordCount}</span>
      </div>
    </div>
  );
}
