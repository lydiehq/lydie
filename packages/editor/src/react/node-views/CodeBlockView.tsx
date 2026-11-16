import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { useMemo, useSyncExternalStore } from "react";
import type { ReactPortal } from "react";
import { createPortal } from "react-dom";

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

// The language pickers of one editor's code blocks, drawn as portals by one component
// (CodeLanguagePickers, in LydieEditor). TipTap's ReactRenderer copies its map of every renderer
// each time one mounts or goes, which made opening and closing a document with many code blocks
// quadratic in them.
type PickerHost = {
  set: (id: string, element: HTMLElement, props: PickerProps) => void;
  remove: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
  portals: () => ReactPortal[];
};

function createPickerHost(): PickerHost {
  const entries = new Map<string, ReactPortal>();
  const listeners = new Set<() => void>();
  let portals: ReactPortal[] = [];
  let dirty = false;
  let queued = false;
  // Many pickers mount in one go (a document opening): one render for all of them.
  const changed = () => {
    dirty = true;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const listener of [...listeners]) listener();
    });
  };
  return {
    set(id, element, props) {
      entries.set(id, createPortal(<LanguagePicker {...props} />, element, id));
      changed();
    },
    remove(id) {
      if (entries.delete(id)) changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    portals() {
      if (dirty) {
        portals = [...entries.values()];
        dirty = false;
      }
      return portals;
    },
  };
}

const pickerHosts = new WeakMap<Editor, PickerHost>();

function pickerHostOf(editor: Editor) {
  let host = pickerHosts.get(editor);
  if (!host) {
    host = createPickerHost();
    pickerHosts.set(editor, host);
  }
  return host;
}

export function CodeLanguagePickers({ editor }: { editor: Editor }) {
  const host = pickerHostOf(editor);
  return useSyncExternalStore(host.subscribe, host.portals, host.portals);
}

let nextPickerId = 0;

const el = (tag: string, className: string) => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

// v1's CodeBlockComponent: a bordered block with a language picker in the corner. The picker is a
// slot so the host can use @lydie/ui's Select; the fallback is a native <select>.
// A plain ProseMirror node view with only the picker in React (a portal, see PickerHost): TipTap's
// React node views move their content element in a ref callback that reads the DOM selection,
// which forces a layout per block, and opening a document with hundreds of code blocks spent most
// of its time there.
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
  const host = pickerHostOf(editor);
  const id = `code-language-${String(nextPickerId++)}`;
  const picker = el("div", "absolute top-3 right-3");
  picker.contentEditable = "false";
  host.set(id, picker, { editor, language: languageOf(node), onChange });
  pre.append(code);
  frame.append(pre, picker);
  dom.append(frame);
  return {
    dom,
    contentDOM: code,
    update(next) {
      if (next.type !== node.type) return false;
      const language = languageOf(next);
      if (language !== languageOf(node)) host.set(id, picker, { editor, language, onChange });
      node = next;
      return true;
    },
    stopEvent: (event) => picker.contains(event.target as Node),
    // Only the code's own content is ProseMirror's; the picker's DOM is React's.
    ignoreMutation: (mutation) => mutation.type !== "selection" && !code.contains(mutation.target),
    destroy: () => host.remove(id),
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
