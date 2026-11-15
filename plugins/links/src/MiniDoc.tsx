// Renders editor JSON read-only, for previews and embeds: cheaper than a second editor, and
// embeds inside it show as links, so transclusion never recurses.
import type { JSONContent } from "@lydie/plugin-api";
import { columnShares } from "@lydie/plugin-api/editor";
import { CheckboxMark } from "@lydie/plugin-api/ui";
import type { ReactNode } from "react";

import { defaultLabel } from "./targets.ts";

const BLOCK_ID = /\s\^[A-Za-z0-9-]+$/;

function marks(node: JSONContent, text: ReactNode, key: number): ReactNode {
  let out = text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <strong key={key}>{out}</strong>;
    else if (mark.type === "italic") out = <em key={key}>{out}</em>;
    else if (mark.type === "strike") out = <s key={key}>{out}</s>;
    else if (mark.type === "code") out = <code key={key}>{out}</code>;
    else if (mark.type === "highlight") out = <mark key={key}>{out}</mark>;
    else if (mark.type === "link")
      out = (
        <span key={key} className="text-blue-700 underline">
          {out}
        </span>
      );
  }
  return out;
}

function inline(nodes: readonly JSONContent[] | undefined): ReactNode[] {
  const list = nodes ?? [];
  return list.map((node, i) => {
    const last = i === list.length - 1;
    switch (node.type) {
      case "text": {
        const text = last ? (node.text ?? "").replace(BLOCK_ID, "") : (node.text ?? "");
        return <span key={i}>{marks(node, text, i)}</span>;
      }
      case "hardBreak":
        return <br key={i} />;
      case "wikiLink": {
        const attrs = node.attrs as {
          target: string;
          heading: string | null;
          blockId: string | null;
          alias: string | null;
        };
        return (
          <span key={i} className="text-blue-700">
            {attrs.alias ?? defaultLabel(attrs)}
          </span>
        );
      }
      case "mathInline":
        return <code key={i}>{inline(node.content)}</code>;
      case "rawInline":
        return <span key={i}>{String(node.attrs?.source ?? "")}</span>;
      case "footnoteReference":
        return <sup key={i}>{String(node.attrs?.label ?? "")}</sup>;
      default:
        return <span key={i}>{inline(node.content)}</span>;
    }
  });
}

function columnWidth(column: JSONContent): number | null {
  const width = column.attrs?.width as unknown;
  return typeof width === "number" && width > 0 ? width : null;
}

function block(node: JSONContent, key: number): ReactNode {
  const children = () => (node.content ?? []).map(block);
  switch (node.type) {
    case "paragraph": {
      const only = node.content?.[0];
      // A lone `^id` paragraph (a block id written under a list) is file syntax, not content.
      if (
        node.content?.length === 1 &&
        only?.type === "text" &&
        /^\^[A-Za-z0-9-]+$/.test(only.text ?? "")
      )
        return null;
      return <p key={key}>{inline(node.content)}</p>;
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      const Tag = `h${level}` as "h1";
      return <Tag key={key}>{inline(node.content)}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList":
      return <ol key={key}>{children()}</ol>;
    case "taskList":
      return (
        <ul key={key} data-type="taskList">
          {children()}
        </ul>
      );
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "taskItem": {
      const checked = Boolean(node.attrs?.checked);
      return (
        <li key={key} data-type="taskItem" data-checked={String(checked)}>
          <span data-task-check="">
            <CheckboxMark isSelected={checked} />
            <span className="sr-only">{checked ? "Done" : "Not done"}</span>
          </span>
          <div>{children()}</div>
        </li>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "callout":
      return (
        <div key={key} data-type="callout" data-kind={String(node.attrs?.kind ?? "note")}>
          {node.attrs?.title ? <strong>{String(node.attrs.title)}</strong> : null}
          {children()}
        </div>
      );
    case "columnList": {
      // The editor's markup and widths, so editor-content.css lays the row out the same way.
      const columns = node.content ?? [];
      const shares = columnShares(columns.map((column) => columnWidth(column)));
      return (
        <div key={key} data-type="column-list">
          {columns.map((column, i) => (
            <div key={i} data-type="column" style={{ flexGrow: shares[i] }}>
              {(column.content ?? []).map(block)}
            </div>
          ))}
        </div>
      );
    }
    case "codeBlock":
    case "mathBlock":
      return (
        <pre key={key}>
          <code>{inline(node.content)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "image":
      return <span key={key}>{`[${String(node.attrs?.alt ?? "image")}]`}</span>;
    case "embed":
      return (
        <p key={key} className="text-blue-700">
          {`↳ ${String(node.attrs?.target ?? "")}`}
        </p>
      );
    case "rawBlock":
      return <pre key={key}>{String(node.attrs?.source ?? "")}</pre>;
    case "table":
      return (
        <table key={key}>
          <tbody>
            {(node.content ?? []).map((row, r) => (
              <tr key={r}>
                {(row.content ?? []).map((cell, c) =>
                  cell.type === "tableHeader" ? (
                    <th key={c}>{(cell.content ?? []).map(block)}</th>
                  ) : (
                    <td key={c}>{(cell.content ?? []).map(block)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return <div key={key}>{children()}</div>;
  }
}

// Shows up to `limit` top-level nodes.
export function MiniDoc({ nodes, limit = 12 }: { nodes: readonly JSONContent[]; limit?: number }) {
  return (
    <div className="editor-content text-[13px] [&>*]:!mx-0 [&>*]:!max-w-none [&>*]:!px-0">
      {nodes.slice(0, limit).map(block)}
      {nodes.length > limit && <p className="text-gray-400">…</p>}
    </div>
  );
}
