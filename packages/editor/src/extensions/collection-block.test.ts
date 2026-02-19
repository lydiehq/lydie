import { CollectionBlock } from "@lydie/editor/extensions";
import { describe, expect, it } from "vitest";

import { createTestEditor, destroyEditor } from "../test-utils";

describe("CollectionBlock Extension", () => {
  describe("node definition", () => {
    it("should create a collectionBlock node with default attributes", () => {
      const editor = createTestEditor();

      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "collectionBlock",
          },
        ],
      });

      const node = editor.state.doc.firstChild;
      expect(node?.type.name).toBe("collectionBlock");
      expect(node?.attrs.collectionId).toBeNull();
      expect(node?.attrs.filters).toEqual({});
      expect(node?.attrs.sortField).toBeNull();
      expect(node?.attrs.sortDirection).toBe("asc");
      expect(node?.attrs.viewMode).toBe("table");

      destroyEditor(editor);
    });

    it("should create a collectionBlock with custom attributes", () => {
      const editor = createTestEditor();

      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "collectionBlock",
            attrs: {
              collectionId: "col-123",
              filters: { status: "active" },
              sortField: "createdAt",
              sortDirection: "desc",
              viewMode: "list",
            },
          },
        ],
      });

      const node = editor.state.doc.firstChild;
      expect(node?.attrs.collectionId).toBe("col-123");
      expect(node?.attrs.filters).toEqual({ status: "active" });
      expect(node?.attrs.sortField).toBe("createdAt");
      expect(node?.attrs.sortDirection).toBe("desc");
      expect(node?.attrs.viewMode).toBe("list");

      destroyEditor(editor);
    });
  });

  describe("node attributes", () => {
    it("should have atom set to true", () => {
      const extension = CollectionBlock;
      expect(extension.config.atom).toBe(true);
    });

    it("should belong to block group", () => {
      const extension = CollectionBlock;
      expect(extension.config.group).toBe("block");
    });
  });

  describe("parsing", () => {
    it("should parse HTML with data-type attribute", () => {
      const editor = createTestEditor();

      const html = '<div data-type="collection-block" data-collection-id="col-456"></div>';
      editor.commands.setContent(html);

      const node = editor.state.doc.firstChild;
      expect(node?.type.name).toBe("collectionBlock");
      expect(node?.attrs.collectionId).toBe("col-456");

      destroyEditor(editor);
    });

    it("should parse empty collection block from HTML", () => {
      const editor = createTestEditor();

      const html = '<div data-type="collection-block"></div>';
      editor.commands.setContent(html);

      const node = editor.state.doc.firstChild;
      expect(node?.type.name).toBe("collectionBlock");

      destroyEditor(editor);
    });
  });

  describe("serialization", () => {
    it("should serialize to HTML with data-type attribute", () => {
      const editor = createTestEditor();

      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "collectionBlock",
            attrs: {
              collectionId: "col-789",
              viewMode: "list",
            },
          },
        ],
      });

      const html = editor.getHTML();
      expect(html).toContain('data-type="collection-block"');
      expect(html).toContain('data-collection-id="col-789"');

      destroyEditor(editor);
    });
  });

  describe("commands", () => {
    it("should insert collectionBlock at current position", () => {
      const editor = createTestEditor("<p>Before</p><p>After</p>");

      editor.commands.focus();
      editor.commands.insertContent({
        type: "collectionBlock",
        attrs: { collectionId: "col-abc" },
      });

      const content = editor.state.doc.toJSON();
      const hasCollectionBlock = content.content?.some(
        (node: { type: string }) => node.type === "collectionBlock",
      );
      expect(hasCollectionBlock).toBe(true);

      destroyEditor(editor);
    });

    it("should update collectionBlock attributes", () => {
      const editor = createTestEditor();

      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "collectionBlock",
            attrs: { collectionId: "col-old" },
          },
        ],
      });

      editor.commands.focus();
      editor.commands.updateAttributes("collectionBlock", { collectionId: "col-new" });

      const node = editor.state.doc.firstChild;
      expect(node?.attrs.collectionId).toBe("col-new");

      destroyEditor(editor);
    });
  });

  describe("deletion", () => {
    it("should delete collectionBlock", () => {
      const editor = createTestEditor();

      editor.commands.setContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          { type: "collectionBlock", attrs: { collectionId: "col-del" } },
          { type: "paragraph", content: [{ type: "text", text: "After" }] },
        ],
      });

      const initialContent = editor.state.doc.toJSON();
      expect(initialContent.content?.length).toBe(3);

      editor.commands.focus();
      editor.commands.deleteNode("collectionBlock");

      const finalContent = editor.state.doc.toJSON();
      const hasCollectionBlock = finalContent.content?.some(
        (node: { type: string }) => node.type === "collectionBlock",
      );
      expect(hasCollectionBlock).toBe(false);

      destroyEditor(editor);
    });
  });
});
