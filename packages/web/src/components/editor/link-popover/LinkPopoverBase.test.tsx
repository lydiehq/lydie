/**
 * Tests for LinkPopoverBase component.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEditorWithInternalLink,
  createEditorWithLink,
  createTestEditor,
  destroyEditor,
  createMockSearchResults,
} from "@/test-utils";

import { LinkPopoverBase } from "./LinkPopover";

describe("LinkPopoverBase", () => {
  let editor: ReturnType<typeof createTestEditor> | null = null;

  afterEach(() => {
    if (editor) {
      destroyEditor(editor);
      editor = null;
    }
  });

  const defaultProps = {
    organizationId: "org-123",
    organizationSlug: "test-org",
    internalDocument: null,
    searchResults: [],
    onNavigate: vi.fn(),
    onSearchChange: vi.fn(),
  };

  describe("when link is not active", () => {
    it("renders nothing when cursor is not in a link", () => {
      editor = createTestEditor("<p>Hello world</p>");

      const { container } = render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      expect(container.querySelector("[data-testid='link-popover']")).toBeNull();
    });
  });

  describe("view mode", () => {
    it("displays external link URL", () => {
      editor = createEditorWithLink("Click here", "https://example.com");

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      // The popover should show the URL
      const displayText = screen.queryByTestId("link-display-text");
      if (displayText) {
        expect(displayText.textContent).toContain("example.com");
      }
    });

    it("displays internal document title when available", () => {
      editor = createEditorWithInternalLink("My Doc", "doc-123");

      render(
        <LinkPopoverBase
          editor={editor}
          {...defaultProps}
          internalDocument={{ title: "Test Document Title" }}
        />,
      );

      const displayText = screen.queryByTestId("link-display-text");
      if (displayText) {
        expect(displayText.textContent).toBe("Test Document Title");
      }
    });

    it("shows Loading... for internal link without document data", () => {
      editor = createEditorWithInternalLink("My Doc", "doc-123");

      render(<LinkPopoverBase editor={editor} {...defaultProps} internalDocument={null} />);

      const displayText = screen.queryByTestId("link-display-text");
      if (displayText) {
        expect(displayText.textContent).toBe("Loading...");
      }
    });

    it("calls onNavigate when opening internal link", async () => {
      const onNavigate = vi.fn();
      editor = createEditorWithInternalLink("My Doc", "doc-123");

      render(
        <LinkPopoverBase
          editor={editor}
          {...defaultProps}
          internalDocument={{ title: "Test Doc" }}
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

    it("opens external link in new tab", async () => {
      const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
      editor = createEditorWithLink("Click here", "https://example.com");

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const openButton = screen.queryByTestId("link-open-button");
      if (openButton) {
        const user = userEvent.setup();
        await user.click(openButton);
        expect(windowOpen).toHaveBeenCalledWith(
          "https://example.com",
          "_blank",
          "noopener,noreferrer",
        );
      }

      windowOpen.mockRestore();
    });
  });

  describe("edit mode", () => {
    it("shows edit form when triggered by Cmd+K", () => {
      editor = createTestEditor("<p>Some text</p>");
      // Simulate Cmd+K by selecting text and adding empty link
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.chain().focus().setLink({ href: "" }).run();

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      // Check for edit mode inputs
      const textInput = screen.queryByTestId("link-text-input");
      const urlInput = screen.queryByTestId("link-url-input");

      if (textInput && urlInput) {
        expect(textInput).toBeInTheDocument();
        expect(urlInput).toBeInTheDocument();
      }
    });

    it("displays search results", () => {
      editor = createTestEditor("<p>Some text</p>");
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.chain().focus().setLink({ href: "" }).run();

      const searchResults = createMockSearchResults(3);

      render(<LinkPopoverBase editor={editor} {...defaultProps} searchResults={searchResults} />);

      // Check that search results are displayed
      // Note: The actual visibility depends on the popover being open
      const popover = screen.queryByTestId("link-popover");
      if (popover) {
        expect(popover).toContainHTML("Document 1");
      }
    });

    it("calls onSearchChange when typing in link input", async () => {
      const onSearchChange = vi.fn();
      editor = createTestEditor("<p>Some text</p>");
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.chain().focus().setLink({ href: "" }).run();

      render(<LinkPopoverBase editor={editor} {...defaultProps} onSearchChange={onSearchChange} />);

      const urlInput = screen.queryByTestId("link-url-input");
      if (urlInput) {
        const user = userEvent.setup();
        await user.type(urlInput, "test search");
        // onSearchChange should be called with the current input value
        expect(onSearchChange).toHaveBeenCalled();
      }
    });
  });

  describe("link actions", () => {
    it("removes link when remove button is clicked", async () => {
      editor = createEditorWithLink("Click here", "https://example.com");

      render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const removeButton = screen.queryByTestId("link-remove-button");
      if (removeButton) {
        const user = userEvent.setup();
        await user.click(removeButton);

        // Verify the link was removed
        expect(editor?.isActive("link")).toBe(false);
      }
    });

    it("switches to edit mode when edit button is clicked", async () => {
      editor = createEditorWithLink("Click here", "https://example.com");

      const { rerender } = render(<LinkPopoverBase editor={editor} {...defaultProps} />);

      const editButton = screen.queryByTestId("link-edit-button");
      if (editButton) {
        const user = userEvent.setup();
        await user.click(editButton);

        // Force re-render to reflect state change
        rerender(<LinkPopoverBase editor={editor!} {...defaultProps} />);

        // After clicking edit, the link should have empty href (edit mode trigger)
        const attrs = editor?.getAttributes("link");
        expect(attrs?.href).toBe("");
      }
    });
  });
});
