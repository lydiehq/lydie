/**
 * Basic tests to verify the test utilities work correctly.
 */

import { describe, expect, it, afterEach } from "vitest";

import {
  createTestEditor,
  createEditorWithLink,
  setEditorSelection,
  isMarkActive,
  getEditorText,
  destroyEditor,
  createMockDocument,
  createMockOrganization,
  createMockSearchResults,
} from "./index";

describe("Test Utilities", () => {
  describe("createTestEditor", () => {
    let editor: ReturnType<typeof createTestEditor> | null = null;

    afterEach(() => {
      if (editor) {
        destroyEditor(editor);
        editor = null;
      }
    });

    it("creates an editor with empty content", () => {
      editor = createTestEditor();
      expect(editor).toBeDefined();
      expect(editor.isEmpty).toBe(true);
    });

    it("creates an editor with HTML content", () => {
      editor = createTestEditor("<p>Hello world</p>");
      expect(getEditorText(editor)).toBe("Hello world");
    });

    it("creates an editor with link content", () => {
      editor = createEditorWithLink("Click me", "https://example.com");
      expect(getEditorText(editor)).toBe("Click me");
      expect(isMarkActive(editor, "link")).toBe(true);
    });

    it("allows setting selection", () => {
      editor = createTestEditor("<p>Hello world</p>");
      setEditorSelection(editor, 1, 6);
      const { from, to } = editor.state.selection;
      expect(from).toBe(1);
      expect(to).toBe(6);
    });
  });

  describe("createMockDocument", () => {
    it("creates a document with default values", () => {
      const doc = createMockDocument();
      expect(doc.id).toBeDefined();
      expect(doc.title).toBe("Test Document");
      expect(doc.organization_id).toBe("org-test-123");
    });

    it("allows overriding values", () => {
      const doc = createMockDocument({
        id: "custom-id",
        title: "Custom Title",
      });
      expect(doc.id).toBe("custom-id");
      expect(doc.title).toBe("Custom Title");
    });
  });

  describe("createMockOrganization", () => {
    it("creates an organization with default values", () => {
      const org = createMockOrganization();
      expect(org.id).toBe("org-test-123");
      expect(org.slug).toBe("test-org");
    });
  });

  describe("createMockSearchResults", () => {
    it("creates specified number of documents", () => {
      const results = createMockSearchResults(5);
      expect(results).toHaveLength(5);
      expect(results[0].id).toBe("doc-1");
      expect(results[4].id).toBe("doc-5");
    });
  });
});
