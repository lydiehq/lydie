// File names in the folder format. A document's file name is its title, made safe for every file
// system Lydie and Obsidian run on; siblings are unique case-insensitively.

// Control characters are not portable in file names either.
// oxlint-disable-next-line no-control-regex
const ILLEGAL = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

// A file name for a title: characters Obsidian rejects in names (or that break links) become "-",
// leading dots and trailing dots/spaces are dropped, long names are cut.
export function fileNameFor(title: string): string {
  let name = title.normalize("NFC").replace(ILLEGAL, "-").trim();
  name = name.replace(/^\.+/, "").replace(/[. ]+$/, "");
  if (name.length > 200) name = name.slice(0, 200).trim();
  return name || "Untitled";
}

// The title of a document named `name`, valid for the contract's `Title`.
export function titleOf(name: string): string {
  const title = name.normalize("NFC").trim().slice(0, 255).trim();
  return title || "Untitled";
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// Default sibling order when no manual order is recorded: natural, case-insensitive name order.
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

// A name not taken among `taken` (compared case-insensitively, since macOS and Windows folders
// are), as Obsidian does: "Name", "Name 1", "Name 2", …
export function uniqueName(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 1; ; i++) {
    const candidate = `${name} ${i}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
