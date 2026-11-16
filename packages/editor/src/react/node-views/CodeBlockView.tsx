import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useMemo, useSyncExternalStore } from "react";

import { grammarsVersion, lowlight, subscribeGrammars } from "../../extensions/code-highlight";
import { useLydieEditorSlots } from "../context";
import type { CodeLanguagePickerProps } from "../context";

// The highlighted languages, once their grammars have loaded (empty until then).
function useLanguages() {
  const loaded = useSyncExternalStore(subscribeGrammars, grammarsVersion);
  return useMemo(() => (loaded ? lowlight.listLanguages().sort() : []), [loaded]);
}

type PickerProps = {
  editor: Editor;
  language: string | null;
  onChange: (language: string | null) => void;
};

function LanguagePicker({ editor, language, onChange }: PickerProps) {
  const { renderCodeLanguagePicker } = useLydieEditorSlots();
  const LANGUAGES = useLanguages();
  const picker: CodeLanguagePickerProps = {
    language,
    languages: language && !LANGUAGES.includes(language) ? [language, ...LANGUAGES] : LANGUAGES,
    onChange,
    isDisabled: !editor.isEditable,
  };
  return renderCodeLanguagePicker ? (
    renderCodeLanguagePicker(picker)
  ) : (
    <NativeLanguageSelect {...picker} />
  );
}

const el = (tag: string, className: string) => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

// v1's CodeBlockComponent: a bordered block with a language picker in the corner. The picker is a
// slot so the host can use @lydie/ui's Select; the fallback is a native <select>.
// A plain ProseMirror node view with only the picker in React: TipTap's React node views move
// their content element in a ref callback that reads the DOM selection, which forces a layout per
// block, and opening a document with hundreds of code blocks spent most of its time there.
export const codeBlockView: NodeViewRenderer = ({ editor, node: initial, getPos }) => {
  let node = initial;
  const dom = el("div", "group relative");
  const frame = el(
    "div",
    "relative flex overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3",
  );
  const pre = el("pre", "m-0! grow");
  const code = document.createElement("code");
  const languageOf = (n: ProseMirrorNode) => (n.attrs.language as string | null) ?? null;
  const onChange = (language: string | null) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "language", language));
  };
  const picker = new ReactRenderer<unknown, PickerProps>(LanguagePicker, {
    editor,
    props: { editor, language: languageOf(node), onChange },
    className: "absolute top-3 right-3",
  });
  picker.element.contentEditable = "false";
  pre.append(code);
  frame.append(pre, picker.element);
  dom.append(frame);
  return {
    dom,
    contentDOM: code,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      picker.updateProps({ language: languageOf(next) });
      return true;
    },
    stopEvent: (event) => picker.element.contains(event.target as Node),
    // Only the code's own content is ProseMirror's; the picker's DOM is React's.
    ignoreMutation: (mutation) => mutation.type !== "selection" && !code.contains(mutation.target),
    destroy: () => picker.destroy(),
  };
};

function NativeLanguageSelect({
  language,
  languages,
  onChange,
  isDisabled,
}: CodeLanguagePickerProps) {
  return (
    <select
      aria-label="Code language"
      value={language ?? ""}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value || null)}
      className="bg-transparent text-sm font-medium text-gray-700 outline-none"
    >
      <option value="">auto</option>
      {languages.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
