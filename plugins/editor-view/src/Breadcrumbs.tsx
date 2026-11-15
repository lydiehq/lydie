// Where the page sits, above it as in v1: parents › title. Each parent is its own live
// `doc.get`, so a rename or a move shows at once.
import { useApp, useDocPrefetch, useQuerySelect } from "@lydie/plugin-api";
import type { DocumentRef } from "@lydie/plugin-api";
import { RightRegular } from "@lydie/plugin-api/ui";

// Guards against a parent cycle and keeps a deep page's bar to one line's worth of lookups.
const MAX_DEPTH = 8;

// Plain buttons: a middle click opens a tab, which a react-aria press does not report.
const crumb = "truncate rounded-md px-1 py-0.5 hover:bg-gray-950/5 hover:text-gray-700";

function Separator() {
  return <RightRegular aria-hidden className="size-3 shrink-0 text-gray-300" />;
}

function Ancestors({ id, depth }: { id: string; depth: number }) {
  const app = useApp();
  const doc = useQuerySelect("doc.get", { id }, (s) => s.data[0]?.document ?? null);
  const prefetch = useDocPrefetch(id);
  if (!doc) return null;
  return (
    <>
      {doc.parentId && depth < MAX_DEPTH && <Ancestors id={doc.parentId} depth={depth + 1} />}
      <li className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className={crumb}
          {...prefetch}
          onClick={(event) => app.openDoc(id, { mode: app.modeFor(event) })}
          onAuxClick={(event) => {
            if (event.button === 1) app.openDoc(id, { mode: app.modeFor(event) });
          }}
        >
          {doc.title || "Untitled"}
        </button>
        <Separator />
      </li>
    </>
  );
}

export function Breadcrumbs({ doc }: { doc: DocumentRef }) {
  return (
    <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center p-2 text-xs text-gray-400">
      <ol className="flex min-w-0 items-center gap-1">
        {doc.parentId && <Ancestors id={doc.parentId} depth={0} />}
        <li className="flex min-w-0 items-center">
          <span aria-current="page" className="truncate px-1 py-0.5 text-gray-600">
            {doc.title || "Untitled"}
          </span>
        </li>
      </ol>
    </nav>
  );
}
