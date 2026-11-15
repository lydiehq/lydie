// Editing a link (or making one from the selection): its text and its target, with suggestions
// for documents, `#` headings and `^` blocks. A block without an id gets one when chosen.
import { fuzzyScore, linkStyleOf, linkTargetFor, useApp, useBackend } from "@lydie/plugin-api";
import type { AppApi, Backend } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import { Button, Input } from "@lydie/plugin-api/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { resolveTarget } from "./resolve.ts";
import { isExternalHref, looksLikeUrl, normalizeUrl, parseWikiTarget } from "./targets.ts";

export type Suggestion = {
  key: string;
  label: string;
  detail?: string;
  // The target text this suggestion puts in the field.
  value: string;
  // A block to give an id first: in document `docId`, top-level index `index`.
  assign?: { docId: string; index: number; doc: string };
};

async function bodyOf(backend: Backend, id: string) {
  const rows = await backend.query("doc.get", { id, includeBody: true });
  return rows[0]?.body?.markdown ?? "";
}

export async function suggestTargets(
  app: AppApi,
  query: string,
  docId: string,
): Promise<Suggestion[]> {
  const backend = app.backend;
  const q = query.trim();
  if (!q) return [];
  if (looksLikeUrl(q) && (isExternalHref(q) || q.includes("."))) {
    return [{ key: "url", label: normalizeUrl(q), detail: "Web link", value: normalizeUrl(q) }];
  }
  const hash = q.indexOf("#");
  if (hash !== -1) {
    const docPart = q.slice(0, hash).trim();
    const fragment = q.slice(hash + 1);
    const targetId = docPart ? await resolveTarget(backend, docPart, docId) : docId;
    if (!targetId) return [];
    const outline = app.editor.outline(await bodyOf(backend, targetId));
    if (fragment.startsWith("^")) {
      const f = fragment.slice(1).toLowerCase();
      return outline.blocks
        .filter(
          (b) => b.text.trim() && (!f || b.text.toLowerCase().includes(f) || b.id?.startsWith(f)),
        )
        .slice(0, 30)
        .map((b) => ({
          key: `b${b.index}`,
          label: b.text.replace(/\s\^[A-Za-z0-9-]+$/, "").slice(0, 80),
          detail: b.id ? `^${b.id}` : b.type,
          value: b.id ? `${docPart}#^${b.id}` : `${docPart}#^`,
          ...(b.id ? {} : { assign: { docId: targetId, index: b.index, doc: docPart } }),
        }));
    }
    const scored = outline.headings
      .map((h) => ({ h, score: fragment ? fuzzyScore(fragment, h.text) : 0 }))
      .filter((x) => x.score !== null);
    if (fragment) scored.sort((a, b) => b.score! - a.score!);
    return scored.slice(0, 30).map(({ h }) => ({
      key: `h${h.block}`,
      label: h.text,
      detail: `H${h.level}`,
      value: `${docPart}#${h.text}`,
    }));
  }
  const hits = await backend.query("doc.search", {
    workspaceId: backend.info.workspaceId,
    text: q,
    limit: 20,
  });
  const top = hits
    .map((h) => ({ h, score: fuzzyScore(q, h.title) ?? -1000 + -h.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  // A folder window names targets per its link path setting (shortest, relative, absolute).
  const style = linkStyleOf(app);
  return Promise.all(
    top.map(async ({ h }) => {
      const value = style ? await linkTargetFor(backend, docId, h.id, style.path) : h.title;
      return {
        key: h.id,
        label: h.title || "Untitled",
        value,
        ...(value !== h.title ? { detail: value } : {}),
      };
    }),
  );
}

// Writes `^id` on a block of the open document directly in the editor (its body is not saved
// yet), or on another document through `doc.updateBody`.
async function assignBlock(
  app: AppApi,
  editor: Editor,
  openDocId: string,
  assign: NonNullable<Suggestion["assign"]>,
): Promise<string | null> {
  if (assign.docId === openDocId) {
    const markdown = app.editor.toMarkdown(app.editor.fromMarkdown(""), editor.getJSON());
    const { id } = app.editor.assignBlockId(markdown, assign.index);
    let pos = 0;
    const doc = editor.state.doc;
    for (let i = 0; i < assign.index && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
    const node = doc.maybeChild(assign.index);
    if (!node) return null;
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      editor
        .chain()
        .insertContentAt(pos + node.nodeSize - 1, ` ^${id}`)
        .run();
    } else {
      editor
        .chain()
        .insertContentAt(pos + node.nodeSize, {
          type: "paragraph",
          content: [{ type: "text", text: `^${id}` }],
        })
        .run();
    }
    return id;
  }
  const markdown = await bodyOf(app.backend, assign.docId);
  const result = app.editor.assignBlockId(markdown, assign.index);
  if (result.markdown !== markdown) {
    await app.backend.ops.doc.updateBody(
      { id: assign.docId, markdown: result.markdown },
      { scope: app.historyScope(), label: "Add block id" },
    );
  }
  return result.id;
}

export function LinkEditor({
  editor,
  docId,
  initialText,
  initialTarget,
  isNew,
  onApply,
  onCancel,
}: {
  editor: Editor;
  docId: string;
  initialText: string;
  initialTarget: string;
  isNew: boolean;
  onApply: (value: { text: string; target: string }) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const backend = useBackend();
  const [text, setText] = useState(initialText);
  const [target, setTarget] = useState(initialTarget);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const targetRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);

  useEffect(() => {
    targetRef.current?.focus();
    targetRef.current?.select();
  }, []);

  useEffect(() => {
    let live = true;
    const handle = setTimeout(() => {
      void suggestTargets(app, target, docId)
        .catch(() => [])
        .then((list) => {
          if (!live) return;
          setSuggestions(list);
          setActive(0);
          picked.current = false;
        });
    }, 60);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [app, backend, target, docId]);

  const choose = async (s: Suggestion): Promise<string> => {
    if (!s.assign) return s.value;
    const id = await assignBlock(app, editor, docId, s.assign);
    return id ? `${s.assign.doc}#^${id}` : s.value;
  };

  // Enter takes the highlighted suggestion when the user picked it, or when it completes what they
  // typed; otherwise the typed text is the target (a link to a note that may not exist yet).
  const takes = (s: Suggestion) =>
    picked.current ||
    Boolean(s.assign) ||
    s.value.toLowerCase().startsWith(target.trim().toLowerCase());

  const apply = async (value?: string) => {
    const finalTarget = (value ?? target).trim();
    if (!finalTarget) return;
    onApply({ text, target: finalTarget });
  };

  const onTargetKey = async (event: KeyboardEvent<HTMLInputElement>) => {
    const current = suggestions[active];
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      picked.current = true;
      setActive((active + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      picked.current = true;
      setActive((active + suggestions.length - 1) % suggestions.length);
    } else if (event.key === "Tab" && current && !event.shiftKey) {
      // Complete without applying, so `#` or `^` can follow.
      event.preventDefault();
      setTarget(await choose(current));
    } else if (event.key === "Enter") {
      event.preventDefault();
      await apply(current && takes(current) ? await choose(current) : undefined);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const parsed = target.trim() && !looksLikeUrl(target) ? parseWikiTarget(target) : null;

  return (
    <form
      aria-label={isNew ? "Create link" : "Edit link"}
      className="flex flex-col gap-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void apply();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label htmlFor={`${listId}-text`} className="flex flex-col gap-1 text-xs text-gray-500">
        Text
        {/* sm fields, the size of the form's sm buttons. */}
        <Input
          size="sm"
          id={`${listId}-text`}
          aria-label="Link text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={parsed ? parsed.target : "Link text"}
        />
      </label>
      <label htmlFor={`${listId}-target`} className="flex flex-col gap-1 text-xs text-gray-500">
        Link to
        <Input
          size="sm"
          ref={targetRef}
          id={`${listId}-target`}
          aria-label="Link target"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- it is an input: the shared Input
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={suggestions[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => void onTargetKey(e)}
          placeholder="Note, Note#Heading, Note#^block or https://…"
        />
      </label>
      {suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="max-h-48 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void choose(s).then((value) => apply(value))}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm aria-selected:bg-gray-950/5"
            >
              <span className="truncate text-gray-900">{s.label}</span>
              {s.detail && (
                <span className="ml-auto shrink-0 text-xs text-gray-400">{s.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" isDisabled={!target.trim()}>
          {isNew ? "Link" : "Save"}
        </Button>
      </div>
    </form>
  );
}
