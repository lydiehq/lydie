// Where a body's text column starts, as `--editor-content-line-start` for editor-content.css: blocks
// that span the page (collection embeds) line their content up with it. Pages that lay out a body with
// editor-content.css outside the editor (share pages) set it the same way.
export function contentLineStart(fullWidth: boolean): string {
  return fullWidth ? "5rem" : "max(1rem, calc((100% - 680px) / 2 + 1rem))";
}
