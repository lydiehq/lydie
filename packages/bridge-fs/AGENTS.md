# AGENTS.md - @lydie/bridge-fs

The file bridge: keeps the local database an index of a folder of Markdown files and the folder in
step with operations. The folder is the source of truth (plan §1): everything the bridge writes to
the database can be rebuilt from the folder and its `.lydie/`. Node only (Electron main, CLI, MCP).

Licence: AGPL-3.0-only.

## May depend on

`@lydie/store`, `@lydie/markdown`, `@lydie/contract`, `@lydie/runtime` (createRuntime, resolveLink,
linkKey, targetKey, uuid). External: `yaml` (reads `lydie.id` of .base files). `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Public API (`src/index.ts`)

```ts
openVault({ folder, databasePath?, dataDir?, actor?, watch?: boolean | WatchOptions, hooks?, onError?,
            gettingStarted? })
  : Promise<Vault>
Vault = { folder, workspaceId, databasePath, store, runtime, bridge, blob, index: IndexReport,
          gettingStartedId, status(): VaultStatus, subscribe(events => …), close() }
// gettingStarted (desktop only; not the CLI or MCP): when this open writes `.lydie/workspace.json`
// into a folder that held nothing but system files (.DS_Store, Thumbs.db, …), write the Getting
// started page (LYD-313) in one transaction off the undo stack; `gettingStartedId` is its id, else
// null. A folder with notes, an `.obsidian/` or an earlier `.lydie/` never gets it.
defaultDataDir(), databasePathFor(folder, dataDir), LOCAL_USER, runnableOperations()

bridge.status / onStatus(fn)          // VaultStatus { state, folder, workspaceId, indexed, total,
                                      //   documents, watching, lastIndex, error }
bridge.onExternalChange(fn)           // { ids } changed by another program
bridge.onConflict(fn)                 // FileConflict { id, path, conflictPath, conflictId, conflicts, at }
bridge.openDocument(id, handle)       // S2, see below → { source, save(doc), close() }
bridge.rescan(paths = [""]), bridge.idle(), bridge.pathOf(id), bridge.idOf(path)
BRIDGE_ACTOR                          // { type: "system", id: "file-bridge" }
extractBody                           // @lydie/markdown's extract in the runtime's Extract shape
readContent(source), prefixLength(source), deriveId(workspaceId, key)
```

`openVault` creates the store (database outside the folder), the runtime (`extract: extractBody`,
`blob: bridge.blob`, `events`: the bridge) and indexes the folder. The runtime only gets the
contract operations it has handlers for (`runnableOperations`), so a contract change ahead of the
runtime does not stop vaults from opening.

## On-disk rules

- **Documents.** Every `.md` file and every folder is a document; `Note.md` and `Note/` together are
  one document (a note with children). A folder without a note has no body (`body: null`) and gets
  `Note.md` when it is given a body or properties. Hidden names (`.obsidian`, `.git`, `.trash`,
  `.lydie`, dot-files), `node_modules`, the attachments folder and `exclude` globs from
  `.lydie/workspace.json` are not indexed. Symlinks are skipped. Files that are not UTF-8 are never
  indexed and never written.
- **Title = file name.** Renames rename the file (and folder). A title a file cannot hold (`/:*?"<>|#^[]`,
  a taken name) is turned into a file name, and the title then follows the name, so a rebuild gives
  the same title. Names are unique case-insensitively, Obsidian style ("Name 1").
- **Body and properties.** The database body is the file minus its frontmatter (and BOM). Frontmatter
  values the contract can hold (string, number, boolean, null, string list) are `properties`; others
  stay in the file untouched. Property edits rewrite only changed keys (@lydie/markdown `save`). Body
  writes keep the frontmatter bytes, the file's line endings (new lines get CRLF in CRLF files) and
  its final newline. Nothing is written when the content is unchanged.
- **Ids** (`ids.ts`): `.lydie/ids.json[key]` > an `id:` in the frontmatter (a UUID; a ULID from before November 2026 reads as the same id) > `deriveId(workspace,
  key)`. Only documents Lydie creates get `id:` (plan §3). Pristine notes are never rewritten: a
  rename of one is recorded in `.lydie/ids.json`, which holds only ids that differ from the default.
- **Order**: siblings sort by name (natural, case-insensitive) unless `.lydie/order.json` lists the
  folder; then the listed names come first in that order. The bridge writes a folder's list only when
  the database's order differs from the default, and removes it when it matches again.
- **Trash**: `doc.delete` moves the file and folder to `.trash/<same path>` (deduped) and records every
  document of the subtree in `.lydie/trash.json` (key, title, deletedAt; the root also parentId and
  sortKey). Restore moves it back; purge deletes it. Only what trash.json lists is indexed from
  `.trash/`; trashed files that vanish are purged.
- **Attachments**: `Blob.put` stages bytes in `.lydie/staging/<sha256>`; `attachment.create` moves them
  to the attachments folder (`workspace.json` `attachmentsFolder`, else Obsidian's
  `attachmentFolderPath`, else `attachments/`) under the file name. Bytes with the same SHA-256 are
  stored once. `.lydie/attachments.json` holds the rows. Purge deletes the file when no row uses it.
- **`.lydie/`**: `workspace.json` (version, workspaceId; written on first open), `ids.json`,
  `order.json`, `trash.json`, `attachments.json`, `staging/`. All small and vault-relative.
- **Writes** are atomic (hidden temp file + fsync + rename); leftovers of a crash are deleted on open.
  In local mode the bridge empties the upload queue once an operation's files landed.

## Databases (`databases.ts`)

- A database is a folder plus `<Folder>/<Folder>.base` (contract's `toBase`/`fromBase`). A database
  created in Lydie is a folder only (no `<Folder>.md` unless it gets a body); its id goes to
  `.lydie/ids.json` and to `lydie.id` in the .base file.
- **Write:** on every `database.changed` (and when the folder moves or is restored), the bridge
  renders the file with `toBase` and writes it only if the text differs; unknown keys round-trip via
  `config.extra`. Renaming the folder renames the file, rewrites `file.inFolder(…)`, rewrites
  `![[X.base]]` embeds in other files, and the rows whose relation/file values point into it.
  `database.delete` moves the file to `.trash/<Folder>/`; `database.restore` writes it again.
- **Read** (open, watcher, full rescan): a folder whose `<Folder>.base` exists (or, after a rename by
  another program, a .base naming the folder's document in `lydie.id`) is a database. The file is
  applied with `fromBase` (+ `.obsidian/types.json`) and `database.setDefinition` when it differs
  from the database; native keys win. A file seen for the first time gets property/view ids derived
  from the document id (no write, so a pristine Obsidian vault stays byte-identical and a rebuild
  gives the same ids); ids minted for things added later in Obsidian are written back. A database
  whose file is gone becomes a page again (`database.delete`). `.base` files outside such folders are
  ignored.
- **Row values:** frontmatter ⇄ `properties` through `fromFileValue`/`toFileValue` for relation and
  files properties (`"[[Path/Title]]"` ⇄ ids; unresolved links stay as written). Other types are the
  frontmatter values as they are (option names, numbers, dates, lists). After a rescan that adds
  or moves documents, `resolveRowLinks` resolves values that are still links (`doc.setProperties`
  as the bridge), so a row read before its target existed catches up. Which rows hold such
  values, and the file name each waits for, is kept from every operation's events (`rowLinks`,
  built from the rows the first time; dropped on `database.changed`), so only rows naming an
  arrived document are read. Bare titles resolve through an index of entries by file name.
- **Relation targets:** a .base file names a relation's target database by id. A database folder
  can have another document id here than in the file: it was indexed while another Lydie process
  was still writing the folder, or the folder was copied without `.lydie/`. When the id names no
  document, `retargetRelations` takes the folder whose own .base names it in `lydie.id` (or named
  it earlier this session: `baseAliases`, since writing a file back replaces its `lydie.id`), and
  the corrected file is written back. A database whose file names another id than its folder makes
  the .base files that relate to it be read again (`retargetTo`), so the order of reading does not
  matter. Tests: "relations follow …" in `databases.test.ts`.

## How it runs

- **Open**: scan, compare with `file_index` (mtime+size, then sha256), read what changed, pair
  vanished and new files by hash (renames while closed keep their ids), write the database directly
  in a few transactions, resolving links in memory with the runtime's own `resolveLink`.
- **Watch** (@parcel/watcher, debounced; delete-only batches wait `renameWindowMs` for the other half
  of a rename): rescan the reported paths, pair renames by hash, then by id, folders by their
  contents, and apply the difference as operations by `BRIDGE_ACTOR` (`history: false`: journaled
  for session undo, never on an undo stack).
- **Operations → files**: the runtime's events port. For each touched document the bridge makes the
  files match the database, then resolves, so an operation completes when its files landed. Those
  tasks jump ahead of queued watcher batches; while a document has unwritten changes, a watcher
  batch never overwrites it from disk (and disk → database body updates carry `expectedVersion`).
- **Write batches**: operations that commit while earlier ones wait for the queue share one write
  (`handleEvents`). Documents are placed one at a time (`placeDoc`: create, move, rename, trash),
  then their rows are read in one go (no bodies when only properties changed: the file keeps its
  body), files are written 8 at a time (`WRITE_CONCURRENCY`), and the file index is recorded in
  one transaction. The database is read again after a write only when the file holds something
  else than it was written from (a merge, fitted line endings). A written file's hash is that of
  its text and its mtime and size come from the temp file, so nothing is read back.
- **Bursts of renames** (typing a title): the renames that commit meanwhile share the next write,
  which moves the file once to the last title. Links rewritten to a name that a later rename
  replaces keep pointing at their target (`keepTargets`), so the next move finds them.
- **Own writes** are recognised by hash (the index is updated before the watcher reports them).
- **Writing over an external change** the bridge has not processed yet: three-way merge with the last
  agreed text (`merge3`); a true conflict keeps the disk version in the file, writes the other one to
  `<name>.conflict-<UTC time>.md` (indexed as a new document), and flags the document with
  `store.conflicts.set({ kind: "file", details: FileConflict })`.
- **Rename/move** rewrites links in other files (and relative links in the moved file) with
  `rewriteLinks`, touching only link bytes.

## Open documents (S2)

`bridge.openDocument(id, { getDoc, applySteps, onConflict?, onClosed? })` returns `{ source, save, close }`.
The editor loads `parse(source)`, calls `save(doc)` to write (splice-preserving `save` against the
last agreed text, then `doc.updateBody` with `history: false`). When the file changes (another
program, an agent's operation), the bridge calls `getDoc()`, runs `reconcile`, and calls
`applySteps(steps)` (ProseMirror replace steps, apply in order). On a conflict the editor's version
goes to the conflict copy, `onConflict` fires and the steps bring the editor to the disk version.

The session keeps the parse of the last agreed text (each `save`'s verification parse) as the
next save's original, so a save parses only what it wrote.

Ordering over the vault service (LYD-254, `serve.ts`):

- Each "steps" event carries `version` (1, 2, … per session) and `basedOn`, the `seq` of the
  `updateDocument` the steps were computed against.
- Updates and saves may carry `seq` (increasing) and `version` (the last steps event applied to
  the doc). An update older than the last steps event is dropped. A save like that writes nothing
  and returns `stale: true`.
- Clients that send neither field get the old behaviour.
- Patches (`DocumentPatch`): instead of the whole document, an update or save may send the
  top-level blocks that changed since update or save `base` (`from`, `to`, `content`, `count`).
  Main applies one only when its copy is exactly that document: no steps sent since and no update
  dropped. Otherwise the update is dropped and the save answers `stale`; the client then sends the
  whole document. Typing in a 2,000-block note sends about 200 bytes per pause instead of 1.2 MB.

## Exports

File names (`fileNameFor`, `uniqueName`, `compareNames`, `titleOf`), `baseDefinitionOf`,
`baseFileFor` and the frontmatter of new files come from @lydie/contract's folder format, which
workspace exports also use, so the two cannot drift. `exportsTo(dir, name)` is the runtime's
`Exports` port for hosts that cannot ask where to save (the CLI: the current directory);
`openVault({ exports })` passes a port to the runtime (the desktop app's save dialog).
`src/export.test.ts`: an export equals the vault folder byte for byte and reopens as the same
workspace; the zip has the same entries; links to files by id (hosted bodies) become the files'
paths and resolve in the reopened vault.

## Tests and tools

```bash
bun --filter=@lydie/bridge-fs run test     # ~6 s: write, index (rebuild rule, help-vault no-op if
                                            # downloaded), external (rescan + real watcher), merge,
                                            # crash (child process killed before rename), converge
bun --filter=@lydie/bridge-fs run bench    # 10k generated notes + Obsidian help vault
```

The help vault is @lydie/markdown's corpus cache (`bun --filter=@lydie/markdown run fetch-corpus`).
`converge.test.ts` interleaves operations and edits by another program (with and without the real
watcher) and checks that every edit is on disk and that database and folder agree.

## Known limits

- Frontmatter links and relation values are indexed as links with `sourceProperty` (LYD-201;
  `INDEX_VERSION` "b3"). A relation keeps its target while that document is in the trash.
- A trashed database comes back from a rebuild as a database (`indexTrashedDatabases`, LYD-214).
- The bridge no longer trims the upload queue: local stores keep none (LYD-169).
- Initial indexing is single-threaded: the full multilingual help vault (6.5k files, 35 MB) takes
  ~22 s cold, dominated by Markdown parsing; 10k small notes ~10 s; warm reopen <0.4 s.
- A document whose operation committed but whose file was not written before a crash is dropped on
  the next open (the folder wins).
- Another process (the CLI) on the same folder has its own database; both see each other's writes
  as external changes.

## Folder settings (LYD-265, `settings.ts`)

- `FolderSettings`: `attachmentsFolder`, `exclude`, `linkFormat` ("wiki" | "markdown"), `linkPath`
  (shortest | relative | absolute), `newNoteLocation` (root | current | folder), `newNoteFolder`
  and `versionHistory` (snapshots | git | off; see "Version history").
- They are stored in `.lydie/workspace.json`. Unset values come from the folder's `.obsidian/`
  settings (read-only), then from `DEFAULT_SETTINGS`.
- `vault.settings()`, `vault.setSettings(patch)` (each field replaces; null resets; `checkPatch`
  throws `SettingsError` naming the field) and `vault.onSettings(listener)`.
- On the vault service: requests `settings` and `setSettings`, stream `settings`.
- A new attachment folder or exclude list rescans the folder (`bridge.setExclusions`). Excluded
  notes leave the index; their files are untouched, and they come back with the same ids.
- `bridge.linkFormat` (option `linkFormat`) is the format for new links. Frontmatter relation and
  file values stay `[[wikilinks]]`, which are the only links Obsidian resolves in properties.

## Indexing cost (round 7)

- The index writes each 500-file chunk with the store's bulk methods, and records the file index in
  one transaction. Before, it ran about 7 statements per note (each a round trip to the database
  worker) and one transaction per file.
- `IndexReport.treeMs`: when the tree was in the database.
- 10k generated notes: cold open 9.6 → 2.8 s (tree 1.8 → 0.47 s); reopen with nothing changed
  171 → 132 ms; reopen with 1% changed 230 → 179 ms. Help vault (all languages): cold 19.6 → 12.4 s.

## Version history (`version-store.ts`, `git-versions.ts`, wiring in `vault.ts`)

The vault gives the runtime one `Versions` port (plan §4, "One mechanism per job"); the
`versionHistory` folder setting chooses what answers it. `vault.versionHistory()` is what is in use.

- **snapshots** (default): @lydie/runtime's `createSnapshotVersions` over `createFileVersionStore`.
  Files live beside the database, outside the folder (`<database path without .sqlite>.versions/`:
  `<doc id>.json` and `<doc id>/<version id>.md`), so they are never notes, are not synced by
  iCloud or Dropbox, and survive a rebuilt database. A purged document's versions are deleted.
  Every body save records a version, so the store writes a document's files at once only when
  they were not written in the last 30 s; later saves wait in memory (`list` and `read` see them)
  and are written together every 30 s and on close (`flush`). A crash loses only those: the note
  is in the folder, and its next save records it as `before_write`.
- **git**: `openGitVersions`. The folder is the working tree (its own repository, or a folder of a
  larger one). Lydie only adds commits; it never pulls, pushes, rebases or resets.
  - A checkpoint is `git add -A` and a commit of the folder, and nothing outside it (`--` with
    the folder's pathspec; `.lydie/staging/` and atomic-write temp files are excluded). It follows
    60 s after the last change (any operation or outside edit; at least every 10 minutes while
    changes go on), before and after a restore, and when the vault closes.
  - Commits carry `Lydie-Kind` (auto | restore), `Lydie-Actor` (one per actor ref) and
    `Lydie-Restored-From` trailers. Other commits are listed as `external` with their subject and
    author as `label`. Versions follow renames (`git log --follow`). A version is the file's body
    at that commit; frontmatter stays what the file has now.
  - The user's git identity is used. Only without one do commits get `Lydie <lydie@localhost>`.
    Hooks are skipped (`--no-verify`). No checkpoint while the repository is mid-merge, rebase,
    cherry-pick, revert or bisect, or on a detached HEAD.
  - git runs with `LC_ALL=C`; decisions come from exit codes and machine formats only.
  - Turning the setting on (`setSettings`) fails with `SettingsError` when git is not installed,
    and makes the folder a repository if it is not in one. Opening never does: a folder set to git
    without a repository (or without git on this device) uses snapshots and reports the reason.
- **off**: nothing is kept; the operations answer with no versions.
- Not built: push/pull to a remote (that would be a peer, plan §4).
- Tests: `versions.test.ts` (both providers through `openVault`; git tests skip without git).
