// Where the page sits, above it as in v1: parents › title. Each parent is its own live
// `doc.get`, so a rename or a move shows at once.
import { useApp, useDocPrefetch, useQuerySelect } from "@lydie/plugin-api";
import type { DocumentRef } from "@lydie/plugin-api";
import { buttonStyles, RightRegular } from "@lydie/plugin-api/ui";

// Guards against a parent cycle and keeps a deep page's bar to one line's worth of lookups.
const MAX_DEPTH = 8;

// Plain buttons: a middle click opens a tab, which a react-aria press does not report. They take
// the look of the bar's ghost buttons (Share, •••), muted, so a crumb hovers the same way.
const crumb = buttonStyles({
  variant: "ghost",
  size: "xs",
  className: "min-w-0 shrink font-normal text-gray-400 hover:text-gray-700",
});

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
      <li className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          className={crumb}
          {...prefetch}
          onClick={(event) => app.openDoc(id, { mode: app.modeFor(event) })}
          onAuxClick={(event) => {
            if (event.button === 1) app.openDoc(id, { mode: app.modeFor(event) });
          }}
        >
          <span className="truncate">{doc.title || "Untitled"}</span>
        </button>
        <Separator />
      </li>
    </>
  );
}

export function Breadcrumbs({ doc }: { doc: DocumentRef }) {
  return (
    <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center text-xs text-gray-400">
      <ol className="flex min-w-0 items-center gap-0.5">
        {doc.parentId && <Ancestors id={doc.parentId} depth={0} />}
        <li className="flex min-w-0 items-center">
          <span
            aria-current="page"
            className="flex h-5.5 min-w-0 items-center px-2 text-gray-600 select-none"
          >
            <span className="truncate">{doc.title || "Untitled"}</span>
          </span>
        </li>
      </ol>
    </nav>
  );
}
