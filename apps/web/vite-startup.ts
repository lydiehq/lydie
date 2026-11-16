// What index.html starts downloading before any module runs (LYD-226 follow-up). The entry
// (`src/main.tsx`) is small and loads the app with a dynamic import, so Vite alone would only
// preload the entry: this adds
//   - modulepreloads for the app's chunks (`src/mount.tsx` and what it imports), in every window;
//   - the self-hosted Inter (latin), which the first paint uses;
//   - a data block (`lydie-preloads`) listing what only a browser window needs: the in-page
//     database's chunks (`src/compose-browser.ts`, `@lydie/store/web`), PowerSync's database worker,
//     its SQLite build and WASM. `src/early.ts` turns it into <link rel=preload> where there is no
//     desktop shell, so an Electron window (same index.html) does not fetch them.
import type { HtmlTagDescriptor, Plugin, Rolldown } from "vite";

type Bundle = Rolldown.OutputBundle;
type Chunk = Rolldown.OutputChunk;

export type StartupFiles = {
  // Chunks every window needs before it can show anything (entry excluded).
  app: string[];
  // What only a browser window needs: module chunks and plain files (worker, WASM).
  browser: { href: string; rel: "modulepreload" | "preload" }[];
  font: string | null;
};

function chunks(bundle: Bundle): Chunk[] {
  return Object.values(bundle).filter((file): file is Chunk => file.type === "chunk");
}

// A chunk and every chunk it imports statically.
function closureFrom(bundle: Bundle, fileName: string): string[] {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const chunk = bundle[name];
    if (chunk?.type === "chunk") for (const next of chunk.imports) visit(next);
  };
  visit(fileName);
  return [...seen];
}

// The same from the chunk holding a module (by the end of its path).
function closure(bundle: Bundle, moduleSuffix: string): string[] {
  const start = chunks(bundle).find((chunk) =>
    chunk.moduleIds.some((id) => id.replace(/\?.*$/, "").endsWith(moduleSuffix)),
  );
  return start ? closureFrom(bundle, start.fileName) : [];
}

function source(bundle: Bundle, fileName: string): string {
  const file = bundle[fileName];
  if (!file) return "";
  if (file.type === "chunk") return file.code;
  return typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
}

// PowerSync's database worker, emitted by the worker build as plain files: the worker (it
// mentions wa-sqlite), the files it imports for the default VFS (SimpleOpfsVFS: the synchronous
// SQLite build, without encryption), and that build's WASM.
function databaseWorkerFiles(bundle: Bundle): string[] {
  const names = Object.keys(bundle);
  const worker = names.find(
    (name) => /(^|\/)worker-[\w-]+\.js$/.test(name) && source(bundle, name).includes("wa-sqlite"),
  );
  if (!worker) return [];
  const dir = worker.slice(0, worker.lastIndexOf("/") + 1);
  const imported = (from: string, pattern: RegExp) =>
    [...source(bundle, from).matchAll(pattern)].map((m) => dir + m[1]).filter((n) => n in bundle);
  const sqlite = imported(worker, /\b(wa-sqlite-[\w]{8}\.js)\b/g);
  const opfs = imported(worker, /\b(SimpleOpfsFileSystem-[\w-]{8}\.js)\b/g);
  const wasm = sqlite.flatMap((file) => imported(file, /\b(wa-sqlite-[\w-]{8}\.wasm)\b/g));
  return [...new Set([worker, ...sqlite, ...opfs, ...wasm])];
}

export function startupFiles(bundle: Bundle, entry: Chunk): StartupFiles {
  const initial = new Set(closureFrom(bundle, entry.fileName));
  const app = closure(bundle, "/src/mount.tsx").filter((name) => !initial.has(name));
  const shared = new Set([...initial, ...app]);
  const browserChunks = [
    ...new Set([
      ...closure(bundle, "/src/compose-browser.ts"),
      ...closure(bundle, "/packages/store/src/web.ts"),
    ]),
  ].filter((name) => !shared.has(name));
  const font =
    Object.keys(bundle).find((name) => /(^|\/)inter-latin-wght-normal-[\w-]+\.woff2$/.test(name)) ??
    null;
  return {
    app,
    browser: [
      ...browserChunks.map((name) => ({ href: name, rel: "modulepreload" as const })),
      ...databaseWorkerFiles(bundle).map((name) => ({ href: name, rel: "preload" as const })),
    ],
    font,
  };
}

export function startupPreloads(): Plugin {
  let base = "/";
  return {
    name: "lydie:startup-preloads",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle || !ctx.chunk) return;
        const files = startupFiles(ctx.bundle, ctx.chunk);
        const url = (name: string) => base + name;
        const tags: HtmlTagDescriptor[] = files.app.map((name) => ({
          tag: "link",
          attrs: { rel: "modulepreload", crossorigin: true, href: url(name) },
          injectTo: "head",
        }));
        if (files.font) {
          tags.push({
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              crossorigin: true,
              href: url(files.font),
            },
            injectTo: "head",
          });
        }
        if (files.browser.length > 0) {
          const list = files.browser.map((file) => ({ href: url(file.href), rel: file.rel }));
          tags.push({
            tag: "script",
            attrs: { type: "application/json", id: "lydie-preloads" },
            // A data block: never executed, so the desktop CSP has nothing to say about it.
            children: JSON.stringify(list).replaceAll("<", "\\u003c"),
            injectTo: "body",
          });
        }
        return tags;
      },
    },
  };
}
