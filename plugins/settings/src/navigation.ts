// Settings navigation without React: grouping and ordering the contributed pages, search, and the
// `settings/<page>/<path>` URLs that deep-link into them.

export type PageEntry = {
  id: string;
  title: string;
  order?: number;
  group?: string;
  description?: string;
  keywords?: readonly string[];
  pluginId: string;
};

// Groups in navigation order; a page's own group outside this list comes after them.
export const GROUP_ORDER = ["General", "Workspace", "Team", "Account", "Integrations", "App"];

export type PageGroup<P extends PageEntry> = { title: string; pages: P[] };

export function groupPages<P extends PageEntry>(pages: readonly P[]): PageGroup<P>[] {
  const groups = new Map<string, P[]>();
  for (const page of pages) {
    const title = page.group ?? "General";
    let list = groups.get(title);
    if (!list) groups.set(title, (list = []));
    list.push(page);
  }
  const rank = (title: string) => {
    const index = GROUP_ORDER.indexOf(title);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([title, list]) => ({
      title,
      pages: list.sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title),
      ),
    }));
}

// Pages in navigation order, flattened.
export function orderedPages<P extends PageEntry>(pages: readonly P[]): P[] {
  return groupPages(pages).flatMap((g) => g.pages);
}

// Every word of the query must appear in the title, group, description or keywords.
export function searchPages<P extends PageEntry>(pages: readonly P[], query: string): P[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ordered = orderedPages(pages);
  if (words.length === 0) return ordered;
  const scored = ordered.flatMap((page) => {
    const title = page.title.toLowerCase();
    const haystack = [title, page.group ?? "", page.description ?? "", ...(page.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    if (!words.every((w) => haystack.includes(w))) return [];
    // Title matches first, then where the first word starts in the title.
    const at = title.indexOf(words[0]!);
    return [{ page, score: at === -1 ? 1000 : at }];
  });
  return scored.sort((a, b) => a.score - b.score).map((s) => s.page);
}

// The page to show for a requested id: it, else the first page.
export function resolvePage<P extends PageEntry>(pages: readonly P[], id: string | null): P | null {
  const ordered = orderedPages(pages);
  return (id ? ordered.find((p) => p.id === id) : undefined) ?? ordered[0] ?? null;
}

export type SettingsLocation = { page: string | null; path: string | null };

// The settings' place in the app's URL, below its base:
// `settings/team/members/u1` → { page: "team", path: "members/u1" }.
export function parseSettingsPath(path: string): SettingsLocation | null {
  const match = /^settings(?:\/([^/]+)(?:\/(.+?))?)?\/?$/.exec(path);
  if (!match) return null;
  try {
    return {
      page: match[1] ? decodeURIComponent(match[1]) : null,
      path: match[2] ? match[2].split("/").map(decodeURIComponent).join("/") : null,
    };
  } catch {
    return null;
  }
}

export function settingsPath(page: string | null, path: string | null): string {
  if (!page) return "settings";
  const tail = path
    ? `/${path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`
    : "";
  return `settings/${encodeURIComponent(page)}${tail}`;
}
