// Mermaid diagrams, drawn by Pele (the renderer Obsidian uses): small, no dependencies, its SVG
// has no scripts or HTML in it, and its colours are CSS variables, so a diagram follows the theme.
// Imported only through here, and only when a document has a diagram, so it lands in chunks of
// its own (one per diagram type).

export type DiagramOutcome = { ok: true } | { ok: false; message: string };

// Draws `source` into `element`, fitted to its width. A diagram that does not parse leaves the
// element empty and says why (the parser's message, with the line).
export async function mountDiagram(element: HTMLElement, source: string): Promise<DiagramOutcome> {
  try {
    const { mountAsync } = await import("pele/lazy");
    await mountAsync(element, source);
    return { ok: true };
  } catch (error) {
    element.replaceChildren();
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

// Whether a code block's language makes it a diagram.
export const isDiagramLanguage = (language: unknown) =>
  typeof language === "string" && /^(mermaid|mmd)$/i.test(language.trim());
