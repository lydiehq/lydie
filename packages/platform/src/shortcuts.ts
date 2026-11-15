// The menu action id the quick-capture shortcut sends (see `GlobalShortcuts`).
export const QUICK_CAPTURE_ACTION = "quick-capture.open";

// The default quick-capture accelerator on desktop.
export const DEFAULT_QUICK_CAPTURE = "CommandOrControl+Shift+Space";

// Electron accelerator syntax: modifiers and one key joined by "+". Checked before it reaches the
// OS so a bad string is an `invalid-argument` error rather than a silent false.
const MODIFIERS = new Set([
  "command",
  "cmd",
  "control",
  "ctrl",
  "commandorcontrol",
  "cmdorctrl",
  "alt",
  "option",
  "altgr",
  "shift",
  "super",
  "meta",
]);
const KEY =
  /^([a-z0-9]|f([1-9]|1[0-9]|2[0-4])|[)!@#$%^&*(:;+<,_>.?~{|}"=\-/`[\]\\']|plus|space|tab|capslock|numlock|scrolllock|backspace|delete|insert|return|enter|up|down|left|right|home|end|pageup|pagedown|escape|esc|volumeup|volumedown|volumemute|medianexttrack|mediaprevioustrack|mediastop|mediaplaypause|printscreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv)$/;

export function isAccelerator(value: string): boolean {
  if (value.length === 0 || value.length > 100) return false;
  // "+" as the key: "Shift++" is not valid Electron syntax; it is spelled "Plus".
  const parts = value.split("+");
  const key = parts.pop()!.toLowerCase();
  if (!KEY.test(key) || parts.length === 0) return false;
  const seen = new Set<string>();
  for (const part of parts) {
    const m = part.toLowerCase();
    if (!MODIFIERS.has(m) || seen.has(m)) return false;
    seen.add(m);
  }
  return true;
}
