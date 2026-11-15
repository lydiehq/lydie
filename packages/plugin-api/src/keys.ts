// Keybindings as strings: "Mod+Shift+P", "Mod+[", "Alt+ArrowLeft", "Escape", "?". "Mod" is Cmd on
// macOS and Ctrl elsewhere. A sequence is chords separated by spaces, pressed one after the other
// as in Linear: "G H" is G, then H.

export type Chord = {
  key: string;
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

const ALIASES: Record<string, string> = {
  esc: "escape",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  space: " ",
  plus: "+",
};

// The chords of a binding: one for "Mod+K", two for "G H".
export function keySequence(binding: string): string[] {
  return binding.trim().split(/\s+/);
}

export function parseKeybinding(binding: string): Chord {
  const parts = binding.split(/\+(?!$)/);
  const chord: Chord = { key: "", mod: false, ctrl: false, shift: false, alt: false };
  for (const raw of parts) {
    const part = raw.toLowerCase();
    if (part === "mod" || part === "cmd" || part === "meta") chord.mod = true;
    else if (part === "ctrl" || part === "control") chord.ctrl = true;
    else if (part === "shift") chord.shift = true;
    else if (part === "alt" || part === "option") chord.alt = true;
    else chord.key = ALIASES[part] ?? part;
  }
  return chord;
}

type KeyEventLike = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

// The key a chord compares against: layout-independent for letters and digits (`code`), so
// Alt/Shift combinations still match.
function eventKey(event: KeyEventLike): string {
  const code = event.code ?? "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Backslash") return "\\";
  return event.key.toLowerCase();
}

export function matchesKeybinding(event: KeyEventLike, binding: string, mac: boolean): boolean {
  const chord = parseKeybinding(binding);
  if (mac) {
    if (chord.mod !== event.metaKey || chord.ctrl !== event.ctrlKey) return false;
    // Off macOS Mod and Ctrl are the same key.
  } else if ((chord.mod || chord.ctrl) !== event.ctrlKey) return false;
  if (chord.alt !== event.altKey) return false;
  const key = eventKey(event);
  // A bare "?" is written as the character it types: whatever Shift it takes on this layout is
  // implied. (With a modifier, Shift stays significant: Mod+[ is not Mod+Shift+[.)
  const bare = !chord.mod && !chord.ctrl;
  if (
    bare &&
    event.shiftKey &&
    !chord.shift &&
    isTypedSymbol(chord.key) &&
    event.key === chord.key
  ) {
    return true;
  }
  if (chord.shift !== event.shiftKey) return false;
  return key === chord.key;
}

function isTypedSymbol(key: string): boolean {
  return key.length === 1 && !/[a-z0-9 ]/.test(key);
}

function keyLabel(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key.replace(/^arrow/, "").replace(/^./, (c) => c.toUpperCase());
}

// One chord as key caps: ["⌘", "⇧", "P"] on macOS, ["Ctrl", "Shift", "P"] elsewhere.
function chordCaps(binding: string, mac: boolean): string[] {
  const chord = parseKeybinding(binding);
  const key = keyLabel(chord.key);
  if (mac) {
    return [
      chord.ctrl ? "⌃" : "",
      chord.alt ? "⌥" : "",
      chord.shift ? "⇧" : "",
      chord.mod ? "⌘" : "",
      key,
    ].filter(Boolean);
  }
  return [
    chord.mod || chord.ctrl ? "Ctrl" : "",
    chord.alt ? "Alt" : "",
    chord.shift ? "Shift" : "",
    key,
  ].filter(Boolean);
}

// A binding as key caps per step, for tooltips and lists: [["⌘", "K"]], or [["G"], ["H"]].
export function keyCaps(binding: string, mac: boolean): string[][] {
  return keySequence(binding).map((step) => chordCaps(step, mac));
}

// "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere; "G then H" for a sequence.
export function formatKeybinding(binding: string, mac: boolean): string {
  return keyCaps(binding, mac)
    .map((caps) => caps.join(mac ? "" : "+"))
    .join(" then ");
}

// Shortcuts that work the browser itself: windows and tabs, history, the address bar, reload,
// developer tools, bookmarks, history and downloads, settings. A page in a browser tab must leave
// them to the browser (the desktop app may use them). Keys web apps commonly take for their own
// content (Mod+K, Mod+F, Mod+P, Mod+S, Mod+D…) are not here.
const BROWSER_SHORTCUTS = [
  "Mod+N",
  "Mod+Shift+N",
  "Mod+T",
  "Mod+Shift+T",
  "Mod+W",
  "Mod+Shift+W",
  "Ctrl+Tab",
  "Ctrl+Shift+Tab",
  "Ctrl+PageUp",
  "Ctrl+PageDown",
  "Ctrl+Shift+PageUp",
  "Ctrl+Shift+PageDown",
  ...Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`),
  "Mod+L",
  "Mod+Shift+R",
  "F5",
  "F12",
  "Mod+Shift+P",
  "Mod+Shift+B",
  "Mod+Shift+O",
  "Mod+Shift+A",
  "Mod+Shift+M",
  "Mod+Shift+Delete",
  "Mod+Shift+I",
  "Mod+Shift+J",
  "Mod+Shift+C",
  "Mod+Shift+S",
  "Mod+Shift+H",
];

const BROWSER_SHORTCUTS_MAC = [
  "Mod+Shift+[",
  "Mod+Shift+]",
  "Mod+Alt+ArrowLeft",
  "Mod+Alt+ArrowRight",
  "Mod+[",
  "Mod+]",
  "Mod+Y",
  "Mod+,",
  "Mod+Shift+L",
  "Mod+Ctrl+F",
  "Mod+Alt+I",
  "Mod+Alt+J",
  "Mod+Alt+C",
  "Mod+Alt+U",
  "Mod+Alt+B",
];

const BROWSER_SHORTCUTS_OTHER = [
  "Alt+ArrowLeft",
  "Alt+ArrowRight",
  "Alt+Home",
  "Ctrl+H",
  "Ctrl+J",
  "Ctrl+U",
  "Ctrl+Shift+K",
  "Ctrl+Shift+E",
  "F11",
];

// One spelling per chord: off macOS Ctrl and Mod are the same key.
function chordId(binding: string, mac: boolean): string {
  const chord = parseKeybinding(binding);
  const mod = chord.mod || (!mac && chord.ctrl);
  const ctrl = mac && chord.ctrl;
  return [mod && "mod", ctrl && "ctrl", chord.alt && "alt", chord.shift && "shift", chord.key]
    .filter(Boolean)
    .join("+");
}

const browserShortcuts = (mac: boolean) => [
  ...BROWSER_SHORTCUTS,
  ...(mac ? BROWSER_SHORTCUTS_MAC : BROWSER_SHORTCUTS_OTHER),
];
const browserIds = new Map<boolean, Set<string>>();

// Whether a keybinding ("Mod+T") or a keydown belongs to the browser.
export function isBrowserShortcut(binding: string | KeyEventLike, mac: boolean): boolean {
  if (typeof binding !== "string")
    return browserShortcuts(mac).some((b) => matchesKeybinding(binding, b, mac));
  let ids = browserIds.get(mac);
  if (!ids) browserIds.set(mac, (ids = new Set(browserShortcuts(mac).map((b) => chordId(b, mac)))));
  return ids.has(chordId(binding, mac));
}

// Whether a keybinding should fire while the user types in a text field or the editor. A sequence
// starts with its first chord, so "G H" never does.
export function firesInText(binding: string): boolean {
  const chord = parseKeybinding(keySequence(binding)[0] ?? "");
  return chord.mod || chord.ctrl || chord.alt || chord.key === "escape" || /^f\d+$/.test(chord.key);
}

// A character key without Mod, Ctrl or Alt ("C", "?", "G H"): it types, so it only works outside
// text, lists and dialogs.
export function isBareKey(binding: string): boolean {
  const chord = parseKeybinding(keySequence(binding)[0] ?? "");
  return !chord.mod && !chord.ctrl && !chord.alt && chord.key.length === 1;
}
