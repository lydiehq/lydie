// The placeholder frame `public/boot-shell.js` paints before the modules load. Whatever replaces
// the loading state (the app, an error, another page) removes it.
export function removeBootShell(): void {
  document.getElementById("boot-shell")?.remove();
}
