import {
  definePlugin,
  docPath,
  docPreviewTarget,
  PageLink,
  useHoverPreview,
  useQuery,
  useTabState,
  useWorkspace,
} from "@lydie/plugin-api";
import type { SearchHit, ViewProps } from "@lydie/plugin-api";
import {
  EmptyState,
  ErrorState,
  focusRingInsetClass,
  NoResultsIllustration,
  Search2Regular,
  SearchField,
  SearchIllustration,
} from "@lydie/plugin-api/ui";
import { memo, useDeferredValue } from "react";

// `<mark>` is the only markup in snippets; render it without innerHTML.
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(<mark>.*?<\/mark>)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("<mark>") ? (
          <mark key={i} className="rounded bg-yellow-100 px-0.5 text-gray-900">
            {part.slice(6, -7)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const Result = memo(function Result({ hit }: { hit: SearchHit }) {
  const { trigger, preview } = useHoverPreview(docPreviewTarget(hit.id));
  return (
    <li>
      {preview}
      <PageLink
        path={docPath(hit.id)}
        title={hit.title}
        {...trigger}
        data-testid="search-result"
        className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-gray-950/3 ${focusRingInsetClass}`}
      >
        <span className="text-sm font-medium text-gray-900">{hit.title || "Untitled"}</span>
        <span className="line-clamp-2 text-xs text-gray-500">
          <Snippet text={hit.snippet} />
        </span>
      </PageLink>
    </li>
  );
});

function SearchView({ tab }: ViewProps) {
  const workspace = useWorkspace();
  const [query, setQuery] = useTabState("query", "");
  const deferred = useDeferredValue(query.trim());
  const { data, isLoading, error } = useQuery(
    "doc.search",
    deferred ? { workspaceId: workspace.workspaceId, text: deferred, limit: 50 } : null,
  );
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[720px] grow flex-col gap-3 px-6 pt-10"
      data-testid="search-view"
    >
      <SearchField
        aria-label="Search documents"
        placeholder="Search all documents"
        value={query}
        onChange={setQuery}
        autoFocus={tab.isActive}
      />
      <div className="min-h-0 grow overflow-y-auto pb-8">
        {error ? (
          <ErrorState title="Search failed" error={error} />
        ) : !deferred ? (
          <EmptyState
            illustration={<SearchIllustration />}
            title="Search titles and text"
            description="Results update as you type."
          />
        ) : data.length === 0 && !isLoading ? (
          <EmptyState
            illustration={<NoResultsIllustration />}
            title="No results"
            description={`Nothing matches “${deferred}”.`}
          />
        ) : (
          <ul aria-label="Search results" className="flex flex-col">
            {data.map((hit) => (
              <Result key={hit.id} hit={hit} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export const searchPlugin = definePlugin({
  id: "search",
  name: "Search",
  description: "Full-text search over titles and bodies.",
  activate(ctx) {
    ctx.views.register({
      path: "/search",
      component: SearchView,
      title: "Search",
      icon: <Search2Regular />,
    });
    ctx.commands.register({
      id: "search.open",
      title: "Search documents",
      icon: <Search2Regular />,
      group: "Navigation",
      // And Linear's /, outside text.
      keybinding: ["Mod+Shift+F", "/"],
      operation: "doc.search",
      run({ app }) {
        app.open("/search", { mode: "tab" });
      },
    });
  },
});

export default searchPlugin;
