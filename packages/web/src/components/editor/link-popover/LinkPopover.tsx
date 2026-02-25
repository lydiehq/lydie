import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { EditFilled, LinkDismissRegular, OpenRegular } from "@fluentui/react-icons";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import { getMarkRange } from "@tiptap/core";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  Button,
  type ButtonProps,
  Input,
  Label,
  Menu,
  MenuItem,
  TextField,
  TooltipTrigger,
  useFilter,
} from "react-aria-components";

type PopoverState =
  | { mode: "closed" }
  | { mode: "view"; href: string; text: string; linkElement: HTMLElement }
  | { mode: "edit"; href: string; text: string; linkElement: HTMLElement | null };

interface SearchDocument {
  id: string;
  title: string | null;
  slug: string | null;
}

interface LinkPopoverProps {
  editor: Editor;
  internalDocument: { title: string | null } | null | undefined;
  onNavigate: (documentId: string) => void;
  searchResults?: SearchDocument[];
  onSearchChange?: (searchTerm: string) => void;
}

function isInternalLink(href: string): boolean {
  return href.startsWith("/");
}

function extractDocumentIdFromInternalLink(href: string): string | null {
  return href.startsWith("/") ? href.replace(/^\//, "") : null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function findLinkElementAtSelection(editor: Editor): HTMLElement | null {
  const { from } = editor.state.selection;
  const coords = editor.view.coordsAtPos(from);

  const allLinks = editor.view.dom.querySelectorAll("a");
  for (const link of allLinks) {
    const rect = link.getBoundingClientRect();
    if (
      coords.top >= rect.top &&
      coords.top <= rect.bottom &&
      coords.left >= rect.left &&
      coords.left <= rect.right
    ) {
      return link as HTMLElement;
    }
  }
  return null;
}

function getLinkStateFromEditor(editor: Editor): PopoverState {
  const { from, to } = editor.state.selection;
  const isCollapsed = from === to;
  const isLinkActive = editor.isActive("link");

  if (isLinkActive && !isCollapsed) {
    const linkAttrs = editor.getAttributes("link");
    const href = linkAttrs.href || "";
    const text = editor.state.doc.textBetween(from, to);
    const linkElement = findLinkElementAtSelection(editor);

    if (href === "") {
      return { mode: "edit", href, text, linkElement };
    }

    const { $from } = editor.state.selection;
    const linkMarkType = editor.schema.marks.link;
    const range = getMarkRange($from, linkMarkType);
    if (range && range.from === from && range.to === to) {
      return { mode: "edit", href, text, linkElement };
    }

    return { mode: "closed" };
  }

  if (!isLinkActive || !isCollapsed) {
    return { mode: "closed" };
  }

  const linkAttrs = editor.getAttributes("link");
  const href = linkAttrs.href || "";
  const { $from } = editor.state.selection;
  const linkMarkType = editor.schema.marks.link;
  const range = getMarkRange($from, linkMarkType);
  const text = range ? editor.state.doc.textBetween(range.from, range.to) : "";
  const linkElement = findLinkElementAtSelection(editor);

  if (href === "") {
    return { mode: "edit", href, text, linkElement };
  }

  if (linkElement) {
    return { mode: "view", href, text, linkElement };
  }

  return { mode: "closed" };
}

function useLinkState(editor: Editor): PopoverState {
  const [state, setState] = useState<PopoverState>(() => getLinkStateFromEditor(editor));

  useEffect(() => {
    const updateState = () => {
      const newState = getLinkStateFromEditor(editor);
      setState((prev) => {
        if (prev.mode !== newState.mode) return newState;
        if (prev.mode === "closed" && newState.mode === "closed") return prev;
        if (
          prev.mode !== "closed" &&
          newState.mode !== "closed" &&
          prev.href === newState.href &&
          prev.text === newState.text &&
          prev.linkElement === newState.linkElement
        ) {
          return prev;
        }
        return newState;
      });
    };

    // Use requestAnimationFrame to defer state reads until after TipTap/ProseMirror
    // has finished its DOM mutations. Reading editor state synchronously during a
    // transaction can cause React to re-render while the DOM is in a transient state,
    // leading to "insertBefore" errors when React tries to reconcile.
    const deferredUpdateState = () => {
      requestAnimationFrame(updateState);
    };

    editor.on("selectionUpdate", deferredUpdateState);
    editor.on("transaction", deferredUpdateState);

    return () => {
      editor.off("selectionUpdate", deferredUpdateState);
      editor.off("transaction", deferredUpdateState);
    };
  }, [editor]);

  return state;
}

function EditModeContent({
  editor,
  initialHref,
  initialText,
  searchResults = [],
  onSearchChange,
}: {
  editor: Editor;
  initialHref: string;
  initialText: string;
  searchResults?: SearchDocument[];
  onSearchChange?: (searchTerm: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });

  const [linkInputValue, setLinkInputValue] = useState(() =>
    isInternalLink(initialHref) ? "" : initialHref,
  );
  const [linkLabelValue, setLinkLabelValue] = useState(initialText);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const filteredResults = searchResults?.filter((doc) =>
    contains(doc.title || "Untitled document", linkInputValue),
  );
  const isMenuOpen = filteredResults && filteredResults.length > 0;

  useEffect(() => {
    onSearchChange?.(linkInputValue);
  }, [linkInputValue, onSearchChange]);

  useEffect(() => {
    if (initialHref === "" && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [initialHref]);

  const handleClose = useCallback(() => {
    if (initialHref === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.commands.focus();
    }
  }, [editor, initialHref]);

  const handleSubmit = useCallback(() => {
    const trimmedUrl = linkInputValue.trim();
    const trimmedLabel = linkLabelValue.trim();

    if (!trimmedLabel) {
      alert("Please enter a label for the link.");
      return;
    }

    if (!trimmedUrl) {
      alert("Please enter a URL or select a document from the list.");
      return;
    }

    const isExternal = trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://");
    const isInternalPath = trimmedUrl.startsWith("/");

    let linkAttrs: Record<string, string>;
    if (isExternal) {
      linkAttrs = {
        kind: "external",
        href: trimmedUrl,
        target: "_blank",
        rel: "noopener noreferrer",
      };
    } else if (isInternalPath) {
      const refId = trimmedUrl.replace(/^\//, "");
      linkAttrs = {
        kind: "internal",
        refId,
        href: trimmedUrl,
      };
    } else {
      linkAttrs = {
        kind: "external",
        href: trimmedUrl.startsWith("//") ? trimmedUrl : `https://${trimmedUrl}`,
        target: "_blank",
        rel: "noopener noreferrer",
      };
    }

    const { $from } = editor.state.selection;
    const linkMarkType = editor.schema.marks.link;
    const range = getMarkRange($from, linkMarkType);

    if (range) {
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .deleteSelection()
        .insertContent({
          type: "text",
          text: trimmedLabel,
          marks: [{ type: "link", attrs: linkAttrs }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: trimmedLabel,
          marks: [{ type: "link", attrs: linkAttrs }],
        })
        .run();
    }
  }, [editor, linkInputValue, linkLabelValue]);

  const handleDocumentSelect = useCallback(
    (docId: string) => {
      const doc = searchResults?.find((d) => d.id === docId);
      const label = linkLabelValue.trim() || doc?.title || "Untitled document";
      const linkAttrs = {
        kind: "internal" as const,
        refId: docId,
        href: doc?.slug ? `/${doc.slug}` : `/${docId}`,
      };

      const { $from } = editor.state.selection;
      const linkMarkType = editor.schema.marks.link;
      const range = getMarkRange($from, linkMarkType);

      if (range) {
        editor
          .chain()
          .focus()
          .setTextSelection(range)
          .deleteSelection()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: linkAttrs }],
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: linkAttrs }],
          })
          .run();
      }
    },
    [editor, linkLabelValue, searchResults],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (isMenuOpen && searchResults && searchResults.length > 0) {
          return;
        }
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleSubmit, handleClose, isMenuOpen, searchResults],
  );

  return (
    <div className="gap-y-2 flex flex-col w-[300px]">
      <TextField className="flex flex-col outline-none placeholder-gray-500">
        <Label className="text-xs text-gray-600 px-1">Text</Label>
        <Input
          value={linkLabelValue}
          onChange={(e) => setLinkLabelValue(e.target.value)}
          placeholder="Enter link text..."
          className="grow px-2 py-1 text-sm border border-gray-200 rounded w-full"
          onKeyDown={handleKeyDown}
          data-testid="link-text-input"
        />
      </TextField>
      <Autocomplete inputValue={linkInputValue} onInputChange={setLinkInputValue} filter={contains}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 grow">
            <TextField
              className="flex flex-col outline-none placeholder-gray-500"
              aria-label="Search or paste a link"
            >
              <Label className="text-xs text-gray-600 px-1">Link</Label>
              <Input
                ref={linkInputRef}
                placeholder="Search or paste a link"
                className="border-gray-200 p-1.5 border rounded-md leading-5 text-gray-900 bg-transparent outline-hidden text-sm"
                onKeyDown={handleKeyDown}
                data-testid="link-url-input"
              />
            </TextField>
          </div>
        </div>
        <span className="text-xs text-gray-500">Documents</span>
        <Menu className="h-32 overflow-y-auto" aria-label="Search documents">
          {searchResults?.map((doc) => (
            <MenuItem
              key={doc.id}
              id={doc.id}
              textValue={doc.title || "Untitled document"}
              className="flex items-center gap-2 w-full p-1.5 text-left text-sm rounded hover:bg-gray-100 cursor-pointer data-focused:bg-gray-100"
              onAction={() => handleDocumentSelect(doc.id)}
            >
              <DocumentIcon className="size-3.5 text-gray-500 shrink-0" />
              <span className="truncate">{doc.title || "Untitled document"}</span>
            </MenuItem>
          ))}
        </Menu>
      </Autocomplete>
    </div>
  );
}

function ViewModeContent({
  editor,
  href,
  internalDocument,
  onNavigate,
}: {
  editor: Editor;
  href: string;
  internalDocument: { title: string | null } | null | undefined;
  onNavigate: (documentId: string) => void;
}) {
  const isInternal = isInternalLink(href);
  const domain = extractDomain(href);

  const displayText = isInternal
    ? internalDocument?.title || "Loading..."
    : !isValidURL(href)
      ? "Invalid link"
      : href;

  const handleOpenLink = useCallback(() => {
    if (isInternal) {
      const documentId = extractDocumentIdFromInternalLink(href);
      if (documentId) {
        onNavigate(documentId);
      }
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [href, isInternal, onNavigate]);

  const handleEditLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").setLink({ href: "" }).run();
  }, [editor]);

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
  }, [editor]);

  return (
    <div className="flex gap-x-1 items-center max-w-[300px]">
      <div className="flex gap-x-2 overflow-hidden text-ellipsis whitespace-nowrap px-1 items-center">
        {isInternal ? (
          <DocumentIcon className="size-3.5 text-gray-500 shrink-0" />
        ) : domain ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt={`${domain} favicon`}
            className="size-4 shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        <div
          className="text-xs text-gray-700 truncate"
          title={displayText}
          data-testid="link-display-text"
        >
          {displayText}
        </div>
      </div>
      <Separator orientation="vertical" className="h-4" />
      <div className="flex gap-x-0.5">
        <LinkPopoverButton
          title={isInternal ? "Open document" : "Open link in new tab"}
          icon={isInternal ? DocumentIcon : OpenRegular}
          onPress={handleOpenLink}
          data-testid="link-open-button"
        >
          {isInternal ? "Open document" : "Open in new tab"}
        </LinkPopoverButton>
        <LinkPopoverButton
          title="Edit link"
          icon={EditFilled}
          onPress={handleEditLink}
          data-testid="link-edit-button"
        >
          Edit link
        </LinkPopoverButton>
        <LinkPopoverButton
          title="Remove link"
          icon={LinkDismissRegular}
          onPress={handleRemoveLink}
          data-testid="link-remove-button"
        >
          Remove link
        </LinkPopoverButton>
      </div>
    </div>
  );
}

type LinkPopoverButtonProps = ButtonProps & {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  "data-testid"?: string;
};

function LinkPopoverButton(props: LinkPopoverButtonProps) {
  const { className: _className, isDisabled, "data-testid": testId, ...rest } = props;
  const defaultClassName = `p-1 flex rounded hover:bg-gray-100 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`;

  return (
    <TooltipTrigger delay={500}>
      <Button {...rest} className={defaultClassName} isDisabled={isDisabled} data-testid={testId}>
        <props.icon className="size-4 text-gray-400" />
      </Button>
      <Tooltip>{props.title}</Tooltip>
    </TooltipTrigger>
  );
}

export function LinkPopoverBase({
  editor,
  internalDocument,
  onNavigate,
  searchResults = [],
  onSearchChange,
}: LinkPopoverProps) {
  const linkState = useLinkState(editor);
  const isOpen = linkState.mode !== "closed";

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ fallbackAxisSideDirection: "end" }), shift({ padding: 8 })],
  });

  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: true,
  });
  const role = useRole(context);
  const { getFloatingProps } = useInteractions([dismiss, role]);

  useEffect(() => {
    if (linkState.mode !== "closed" && linkState.linkElement) {
      refs.setReference(linkState.linkElement);
    } else if (linkState.mode === "edit" && !linkState.linkElement) {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      refs.setReference({
        getBoundingClientRect: () => ({
          x: coords.left,
          y: coords.top,
          top: coords.top,
          left: coords.left,
          bottom: coords.bottom,
          right: coords.right,
          width: 0,
          height: coords.bottom - coords.top,
        }),
      });
    }
  }, [linkState, refs, editor]);

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className="z-50 bg-white rounded-lg shadow-popover p-1 flex flex-col"
        data-testid="link-popover"
      >
        {linkState.mode === "edit" ? (
          <EditModeContent
            editor={editor}
            initialHref={linkState.href}
            initialText={linkState.text}
            searchResults={searchResults}
            onSearchChange={onSearchChange}
          />
        ) : linkState.mode === "view" ? (
          <ViewModeContent
            editor={editor}
            href={linkState.href}
            internalDocument={internalDocument}
            onNavigate={onNavigate}
          />
        ) : null}
      </div>
    </FloatingPortal>
  );
}

export function LinkPopover({
  editor,
  organizationId,
  organizationSlug,
}: {
  editor: Editor;
  organizationId: string;
  organizationSlug: string;
}) {
  const navigate = useNavigate({ from: "/w/$organizationSlug" });
  const linkState = useLinkState(editor);

  const [searchTerm, setSearchTerm] = useState("");

  const documentId =
    linkState.mode !== "closed" ? extractDocumentIdFromInternalLink(linkState.href) : null;

  const [internalDocument] = useQuery(
    queries.documents.byId({
      organizationId: organizationId,
      documentId: documentId || "",
    }),
  );

  const [searchResults] = useQuery(
    queries.documents.search({
      organizationId: organizationId,
      searchTerm: searchTerm,
    }),
  );

  const handleNavigate = useCallback(
    (docId: string) => {
      void navigate({
        to: "/w/$organizationSlug/$id" as ".",
        params: { organizationSlug: organizationSlug as string, id: docId },
      });
    },
    [navigate, organizationSlug],
  );

  return (
    <LinkPopoverBase
      editor={editor}
      internalDocument={internalDocument}
      searchResults={searchResults ?? []}
      onNavigate={handleNavigate}
      onSearchChange={setSearchTerm}
    />
  );
}
