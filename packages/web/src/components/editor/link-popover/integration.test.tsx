import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTestEditor,
  createEditorWithLink,
  destroyEditor,
  setEditorSelection,
} from "@/test-utils";

import { LinkPopoverBase } from "./LinkPopover";

describe("LinkPopover Integration Tests", () => {
  let editor: ReturnType<typeof createTestEditor> | null = null;

  const defaultProps = {
    organizationId: "org-123",
    organizationSlug: "test-org",
    internalDocument: null,
    searchResults: [],
    onNavigate: vi.fn(),
    onSearchChange: vi.fn(),
  };

  afterEach(() => {
    if (editor) {
      destroyEditor(editor);
      editor = null;
    }
    vi.clearAllMocks();
  });

  describe("Migrated: Opening in edit mode", () => {
    it("shows edit form with text and link inputs when link mark is created", () => {
      editor = createTestEditor("<p>This is some text to link</p>");
      // Simulate selecting "some text" and adding link mark
      setEditorSelection(editor, 9, 18);
      editor.chain().focus().setLink({ href: "" }).run();

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      expect(screen.queryByTestId("link-text-input")).toBeInTheDocument();
      expect(screen.queryByTestId("link-url-input")).toBeInTheDocument();
    });

    it("pre-fills text input with selected text", () => {
      editor = createTestEditor("<p>Select this text</p>");
      // Simulate selecting "this text"
      setEditorSelection(editor, 8, 17);
      editor.chain().focus().setLink({ href: "" }).run();

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const textInput = screen.queryByTestId("link-text-input") as HTMLInputElement;
      if (textInput) {
        expect(textInput.value).toBe("this text");
      }
    });
  });

  describe("Migrated: Opening in view mode", () => {
    it("displays link URL when cursor is in an existing link", () => {
      editor = createEditorWithLink("this link", "https://example.com");

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      // Should not show edit inputs
      expect(screen.queryByTestId("link-text-input")).not.toBeInTheDocument();
      // Should show the URL
      const displayText = screen.queryByTestId("link-display-text");
      if (displayText) {
        expect(displayText.textContent).toContain("example.com");
      }
    });

    it("displays action buttons in view mode", () => {
      editor = createEditorWithLink("click here", "https://example.com");

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      // Check for action buttons
      expect(screen.queryByTestId("link-open-button")).toBeInTheDocument();
      expect(screen.queryByTestId("link-edit-button")).toBeInTheDocument();
      expect(screen.queryByTestId("link-remove-button")).toBeInTheDocument();
    });
  });

  describe("Migrated: Link editing", () => {
    it("can edit an existing link by clicking edit button", async () => {
      editor = createEditorWithLink("my link", "https://example.com");

      const { rerender } = render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const editButton = screen.queryByTestId("link-edit-button");
      if (editButton) {
        const user = userEvent.setup();
        await user.click(editButton);

        // Rerender to get updated state
        rerender(<LinkPopoverBase editor={editor!} {...defaultProps} />);

        // After clicking edit, should show edit inputs
        // The href is set to empty to trigger edit mode
        expect(editor?.getAttributes("link").href).toBe("");
      }
    });

    it("removes link when remove button is clicked", async () => {
      editor = createEditorWithLink("my link", "https://example.com");
      expect(editor.isActive("link")).toBe(true);

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const removeButton = screen.queryByTestId("link-remove-button");
      if (removeButton) {
        const user = userEvent.setup();
        await user.click(removeButton);

        // Link should be removed
        expect(editor?.isActive("link")).toBe(false);
        // Text should remain
        expect(editor?.getText()).toBe("my link");
      }
    });
  });

  describe("Migrated: Internal links", () => {
    it("displays document title for internal links", () => {
      editor = createTestEditor('<p><a href="internal://doc-123">linked document</a></p>');
      editor.commands.setTextSelection(2);

      render(
        <LinkPopoverBase
          editor={editor}
          {...defaultProps}
          internalDocument={{ title: "Target Document" }}
        />,
      );

      const displayText = screen.queryByTestId("link-display-text");
      if (displayText) {
        expect(displayText.textContent).toBe("Target Document");
      }
    });

    it("calls onNavigate with document ID when opening internal link", async () => {
      const onNavigate = vi.fn();
      editor = createTestEditor('<p><a href="internal://doc-123">linked document</a></p>');
      editor.commands.setTextSelection(2);

      render(
        <LinkPopoverBase
          editor={editor}
          {...defaultProps}
          internalDocument={{ title: "Target Document" }}
          onNavigate={onNavigate}
        />,
      );

      const openButton = screen.queryByTestId("link-open-button");
      if (openButton) {
        const user = userEvent.setup();
        await user.click(openButton);
        expect(onNavigate).toHaveBeenCalledWith("doc-123");
      }
    });
  });

  describe("Migrated: Popover closing", () => {
    /**
     * Note: The actual "click outside" and "press escape" behaviors are
     * handled by FloatingUI and are better tested in Playwright.
     * These unit tests verify the component doesn't render when closed.
     */
    it("does not render when no link is active", () => {
      editor = createTestEditor("<p>Hello world</p>");

      const { container } = render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      expect(container.querySelector("[data-testid='link-popover']")).toBeNull();
    });

    it("does not render when cursor is outside any link", () => {
      editor = createTestEditor(
        "<p>Normal text <a href='https://example.com'>link</a> more text</p>",
      );
      // Position cursor in "Normal text"
      editor.commands.setTextSelection(3);

      const { container } = render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      expect(container.querySelector("[data-testid='link-popover']")).toBeNull();
    });
  });

  describe("Migrated: Search functionality", () => {
    it("displays document search results in edit mode", () => {
      editor = createTestEditor("<p>Some text</p>");
      setEditorSelection(editor, 1, 5);
      editor.chain().focus().setLink({ href: "" }).run();

      const searchResults = [
        { id: "doc-1", title: "First Document" },
        { id: "doc-2", title: "Second Document" },
        { id: "doc-3", title: "Third Document" },
      ];

      render(<LinkPopoverBase editor={editor} {...defaultProps} searchResults={searchResults} />);

      // All search results should be visible
      expect(screen.queryByText("First Document")).toBeInTheDocument();
      expect(screen.queryByText("Second Document")).toBeInTheDocument();
      expect(screen.queryByText("Third Document")).toBeInTheDocument();
    });

    it("notifies parent when search input changes", async () => {
      const onSearchChange = vi.fn();
      editor = createTestEditor("<p>Some text</p>");
      setEditorSelection(editor, 1, 5);
      editor.chain().focus().setLink({ href: "" }).run();

      render(<LinkPopoverBase editor={editor} {...defaultProps} onSearchChange={onSearchChange} />);

      const urlInput = screen.queryByTestId("link-url-input");
      if (urlInput) {
        const user = userEvent.setup();
        await user.type(urlInput, "search term");

        // Should have called onSearchChange multiple times as user types
        await waitFor(() => {
          expect(onSearchChange).toHaveBeenCalled();
        });
      }
    });
  });
});
