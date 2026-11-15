// Version history kept in git: the `Versions` provider for a folder that is (inside) a git
// repository, for people who turn it on. The folder is the working tree and files are committed as
// they are. Lydie only ever adds commits: it never pulls, pushes, rebases or resets.
//
//   record/touch   something changed: a checkpoint commit follows once changes go quiet
//   checkpoint     `git add -A` and commit of the folder (and nothing outside it)
//   list / get     the commits that changed a document's file, and its body at one of them
//
// Commits made here carry trailers (`Lydie-Kind`, `Lydie-Actor`, `Lydie-Restored-From`), so a
// version can say who changed the body; commits by other programs are listed as `external`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { DocumentVersion } from "@lydie/contract";
import type { BodyChange, Versions } from "@lydie/runtime";

import { readContent } from "./content.ts";
import { META_DIR, TEMP_MARKER } from "./paths.ts";

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args[0] ?? ""} failed${code === null ? "" : ` (${code})`}: ${stderr.trim()}`);
    this.name = "GitError";
  }
}

type GitResult = { code: number; stdout: string; stderr: string };

const TIMEOUT_MS = 30_000;

// Runs git in `cwd`. Output is read as C-locale text, and decisions are made from exit codes and
// machine formats only, never from translated messages.
function git(
  cwd: string,
  args: readonly string[],
  options: { input?: string; ok?: readonly number[] } = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === null || !(options.ok ?? [0]).includes(code)) {
        reject(new GitError(args, code, stderr));
        return;
      }
      resolve({ code, stdout: Buffer.concat(out).toString("utf8"), stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}

export async function gitAvailable(): Promise<boolean> {
  try {
    await git(process.cwd(), ["--version"]);
    return true;
  } catch {
    return false;
  }
}

// Whether `folder` is in a git working tree (its own repository or a folder of a larger one).
export async function isGitRepository(folder: string): Promise<boolean> {
  try {
    const { stdout } = await git(folder, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function initGitRepository(folder: string): Promise<void> {
  await git(folder, ["init", "-q"]);
}

export type GitVersionsOptions = {
  folder: string;
  // A document's vault-relative Markdown file ("Notes/Idea.md"), or null when it has none.
  pathOf(id: string): string | null;
  // Resolves when the files of finished operations are written (the bridge is idle).
  settled?(): Promise<void>;
  // A checkpoint follows this long after the last change. Default 60 s.
  idleMs?: number;
  // While changes keep coming, a checkpoint is taken at least this often. Default 10 minutes.
  maxWaitMs?: number;
  onError?: (error: unknown) => void;
};

export type GitVersions = Required<Versions> & {
  // Something in the folder changed (any operation, an edit by another program).
  touch(actors?: readonly string[]): void;
  // Takes a checkpoint now if anything changed. Resolves to the commit, or null.
  flush(): Promise<string | null>;
  // Takes a last checkpoint and stops.
  close(): Promise<void>;
};

const SEP = "\x1f";
const RECORD = "\x1e";
const trailer = (key: string) => `%(trailers:key=${key},valueonly=true,separator=%x2C)`;
const LOG_FORMAT = `${RECORD}%H${SEP}%aI${SEP}%an${SEP}%s${SEP}${trailer("Lydie-Kind")}${SEP}${trailer("Lydie-Actor")}${SEP}${trailer("Lydie-Restored-From")}${SEP}`;
const COMMIT_ID = /^[0-9a-f]{40,64}$/;
// States in which a commit would end up somewhere the user does not expect.
const BUSY = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
  "rebase-merge",
  "rebase-apply",
];

type Entry = { version: DocumentVersion; path: string };

export async function openGitVersions(options: GitVersionsOptions): Promise<GitVersions> {
  const { folder } = options;
  const idleMs = options.idleMs ?? 60_000;
  const maxWaitMs = options.maxWaitMs ?? 600_000;
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  if (!(await isGitRepository(folder))) throw new Error(`Not a git repository: ${folder}`);

  const gitDir = (await git(folder, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
  // The user's own identity. Only without one do commits get a name, and an address nobody can
  // own, so they are never credited to someone's account.
  const identity: string[] = [];
  for (const [key, fallback] of [
    ["user.name", "Lydie"],
    ["user.email", "lydie@localhost"],
  ] as const) {
    const set = await git(folder, ["config", "--get", key], { ok: [0, 1] });
    if (set.stdout.trim() === "") identity.push("-c", `${key}=${fallback}`);
  }
  // Never committed: bytes staged for attachments and the temp files of atomic writes.
  const pathspec = [".", `:(exclude)${META_DIR}/staging`, `:(exclude,glob)**/.*${TEMP_MARKER}*`];

  // One git command at a time (they share the index lock).
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  let closed = false;
  let dirty = false;
  let firstChange = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const actors = new Set<string>();
  const documents = new Set<string>();
  let restored: { from: string } | null = null;

  function schedule(): void {
    if (closed) return;
    const now = Date.now();
    if (!dirty) firstChange = now;
    dirty = true;
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, Math.min(idleMs, firstChange + maxWaitMs - now));
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(onError);
    }, wait);
    // A pending checkpoint must not keep a command-line run alive; close() takes it.
    timer.unref?.();
  }

  function message(): string[] {
    const paths = [...documents].map((id) => options.pathOf(id)).filter((p) => p !== null);
    const what =
      paths.length === 1 ? paths[0]! : paths.length > 1 ? `${paths.length} notes` : "the workspace";
    const trailers = [
      `Lydie-Kind: ${restored ? "restore" : "auto"}`,
      ...[...actors].sort().map((actor) => `Lydie-Actor: ${actor}`),
      ...(restored ? [`Lydie-Restored-From: ${restored.from}`] : []),
    ];
    return ["-m", `${restored ? "Restore" : "Update"} ${what}`, "-m", trailers.join("\n")];
  }

  // Commits what changed in the folder. Skipped while the repository is in the middle of
  // something or its HEAD is detached; the changes stay pending for the next checkpoint.
  async function commit(): Promise<string | null> {
    if (BUSY.some((name) => existsSync(join(gitDir, name)))) return null;
    const branch = await git(folder, ["symbolic-ref", "-q", "HEAD"], { ok: [0, 1] });
    if (branch.code !== 0) return null;
    await git(folder, ["add", "-A", "--", ...pathspec]);
    const staged = await git(folder, ["diff", "--cached", "--quiet", "--", ...pathspec], {
      ok: [0, 1],
    });
    if (staged.code === 1) {
      // Hooks are for the user's own commits; `--` keeps anything staged outside the folder out.
      await git(folder, [
        ...identity,
        "commit",
        "-q",
        "--no-verify",
        ...message(),
        "--",
        ...pathspec,
      ]);
    }
    dirty = false;
    actors.clear();
    documents.clear();
    restored = null;
    if (staged.code === 0) return null;
    return (await git(folder, ["rev-parse", "HEAD"])).stdout.trim();
  }

  // The wait for the bridge happens before taking a turn at git, never while holding it: a
  // checkpoint asked for from inside a database transaction must not queue behind that wait.
  async function flush(wait = true): Promise<string | null> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (wait && dirty) await options.settled?.();
    return serial(async () => (dirty ? commit() : null));
  }

  // The commits that changed a document's file, newest first, following renames. Paths are
  // relative to the repository, as git reports them.
  async function history(documentId: string, limit?: number): Promise<Entry[]> {
    const path = options.pathOf(documentId);
    if (!path || path.endsWith("/")) return [];
    const log = await serial(() =>
      git(
        folder,
        [
          "log",
          "--follow",
          ...(limit ? ["-n", String(limit)] : []),
          `--format=${LOG_FORMAT}`,
          "--name-only",
          "--",
          path,
        ],
        // 128: no commits yet.
        { ok: [0, 128] },
      ),
    );
    if (log.code !== 0) return [];
    const entries: Entry[] = [];
    for (const chunk of log.stdout.split(RECORD).slice(1)) {
      const [
        id = "",
        date = "",
        author = "",
        subject = "",
        kind = "",
        by = "",
        from = "",
        rest = "",
      ] = chunk.split(SEP);
      const name = rest.split("\n").find((line) => line.trim() !== "");
      if (!name) continue;
      const ours = kind === "auto" || kind === "restore";
      entries.push({
        path: name,
        version: {
          id,
          documentId,
          kind: kind === "auto" || kind === "restore" ? kind : "external",
          authors: by === "" ? [] : by.split(","),
          restoredFrom: from === "" ? null : from,
          sizeBytes: 0,
          createdAt: new Date(date).toISOString(),
          label: ours ? null : `${subject} (${author})`,
        },
      });
    }
    if (entries.length === 0) return entries;
    // Sizes of the files as committed, in one call.
    const sizes = await serial(() =>
      git(folder, ["cat-file", "--batch-check=%(objectsize)"], {
        input: entries.map((e) => `${e.version.id}:${e.path}\n`).join(""),
      }),
    );
    sizes.stdout.split("\n").forEach((line, i) => {
      const entry = entries[i];
      const size = Number(line);
      if (entry && line !== "" && Number.isInteger(size)) entry.version.sizeBytes = size;
    });
    return entries;
  }

  return {
    async list(documentId, limit) {
      return (await history(documentId, limit)).map((e) => e.version);
    },

    async get(documentId, versionId) {
      // Only commits in this document's own history: a version id is never a way to read
      // something else out of the repository.
      if (!COMMIT_ID.test(versionId)) return null;
      const entry = (await history(documentId)).find((e) => e.version.id === versionId);
      if (!entry) return null;
      const shown = await serial(() => git(folder, ["show", `${versionId}:${entry.path}`]));
      // Versions are bodies: frontmatter stays what the file has now.
      return { version: entry.version, markdown: readContent(shown.stdout).body };
    },

    record(change: BodyChange) {
      actors.add(change.actor);
      documents.add(change.documentId);
      if (change.restoredFrom) {
        // A restore is its own commit, so the version it makes says what it restored.
        restored = { from: change.restoredFrom };
        dirty = true;
        return flush().then(
          () => {},
          (error) => onError(error),
        );
      }
      schedule();
    },

    // Runs inside the operation's database transaction, so it must not wait for the bridge (whose
    // work needs the database): the document's file is as the last finished operation left it.
    async checkpoint(documentId) {
      const path = options.pathOf(documentId);
      if (!path || path.endsWith("/")) return null;
      try {
        dirty = true;
        await flush(false);
        const last = await serial(() =>
          git(folder, ["log", "-1", "--format=%H", "--", path], { ok: [0, 128] }),
        );
        return last.stdout.trim() || null;
      } catch (error) {
        onError(error);
        return null;
      }
    },

    touch(by = []) {
      for (const actor of by) actors.add(actor);
      schedule();
    },

    flush: () => flush(),

    async close() {
      if (closed) return;
      try {
        await flush();
      } catch (error) {
        onError(error);
      }
      closed = true;
    },
  };
}
