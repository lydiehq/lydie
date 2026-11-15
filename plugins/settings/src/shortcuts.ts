import { parseKeybinding } from "@lydie/plugin-api";
import type { CommandInfo } from "@lydie/plugin-api";

// What a keydown records as a keybinding ("Mod+Shift+K"); null for a lone modifier.
export function bindingOf(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac: boolean,
): string | null {
  if (["Meta", "Control", "Shift", "Alt", "CapsLock", "Fn"].includes(event.key)) return null;
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (mac && event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const code = event.code;
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit\d$/.test(code)
      ? code.slice(5)
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key;
  parts.push(key);
  return parts.join("+");
}

// A binding in one canonical spelling, so "Shift+Mod+k" and "Mod+Shift+K" compare equal.
export function normaliseBinding(binding: string): string {
  try {
    const parsed = parseKeybinding(binding);
    return JSON.stringify(parsed);
  } catch {
    return binding.toLowerCase();
  }
}

// Other commands already bound to `binding`.
export function conflictsOf(
  commands: readonly CommandInfo[],
  binding: string,
  commandId: string,
): CommandInfo[] {
  const wanted = normaliseBinding(binding);
  return commands.filter(
    (c) => c.id !== commandId && c.keybindings.some((k) => normaliseBinding(k) === wanted),
  );
}

// Bare letters would fire while typing in lists; a binding needs a modifier or a non-character key.
export function isUsableBinding(binding: string): boolean {
  const parts = binding.split("+");
  const key = parts.at(-1) ?? "";
  return parts.length > 1 || key.length > 1;
}
