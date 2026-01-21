import type { Editor } from "@tiptap/core"
import { useEffect, useState, useRef } from "react"
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useRole,
  useInteractions,
  FloatingFocusManager,
  FloatingPortal,
  type Placement,
} from "@floating-ui/react"
import { Separator } from "../generic/Separator"
import {
  Button,
  Input,
  TextField,
  Label,
  Menu,
  MenuItem,
  Autocomplete,
  useFilter,
  type ButtonProps,
  TooltipTrigger,
} from "react-aria-components"
import { EditIcon, ExternalLinkIcon, DocumentIcon, UnlinkIcon } from "@/icons"
import type { ComponentType, SVGProps } from "react"
import { useQuery } from "@rocicorp/zero/react"
import { useAuth } from "@/context/auth.context"
import { useOrganization } from "@/context/organization.context"
import { queries } from "@lydie/zero/queries"
import { useNavigate } from "@tanstack/react-router"
import { Tooltip } from "../generic/Tooltip"

type Props = {
  editor: Editor
  onOpenLinkDialog?: (callback: () => void) => void
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return ""
  }
}

function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function isInternalLink(href: string): boolean {
  return href.startsWith("internal://")
}

function extractDocumentIdFromInternalLink(href: string): string | null {
  if (!isInternalLink(href)) return null
  return href.replace("internal://", "")
}

export function LinkPopover({ editor, onOpenLinkDialog }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [linkData, setLinkData] = useState<{
    href: string
  } | null>(null)
  const linkElementRef = useRef<HTMLElement | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [linkInputValue, setLinkInputValue] = useState("")
  const [linkLabelValue, setLinkLabelValue] = useState("")
  const previousLinkState = useRef(false)
  const [isProgrammaticOpen, setIsProgrammaticOpen] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const isProcessingSelection = useRef(false)

  const { session } = useAuth()
  const { organization } = useOrganization()

  const [searchResults] = useQuery(
    queries.documents.search({
      organizationId: organization.id,
      searchTerm: linkInputValue,
    }),
  )

  const documentId = linkData ? extractDocumentIdFromInternalLink(linkData.href) : null
  const [internalDocument] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId: documentId || "",
    }),
  )

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "top" as Placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "end",
      }),
      shift({ padding: 8 }),
    ],
  })

  const dismiss = useDismiss(context)
  const role = useRole(context)

  const { getFloatingProps } = useInteractions([dismiss, role])

  // Use React Aria's filter hook
  const { contains } = useFilter({ sensitivity: "base" })

  // Helper to set link in editor
  const setLinkInEditor = (href: string) => {
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
  }

  // Helper to close editing mode and reset state
  const closeEditingMode = () => {
    setIsEditing(false)
    setIsOpen(false)
    setLinkInputValue("")
    setLinkLabelValue("")
    setIsProgrammaticOpen(false)
    setHasSelection(false)
  }

  // Helper to open link dialog programmatically
  const openLinkDialog = () => {
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")
    const hasTextSelection = selectedText.length > 0

    setHasSelection(hasTextSelection)
    setIsProgrammaticOpen(true)
    setIsEditing(true)
    setLinkData({ href: "" })
    setLinkInputValue("")

    if (hasTextSelection) {
      // If there's a selection, use it as the label
      setLinkLabelValue(selectedText)
    } else {
      // No selection, user will need to enter both label and URL
      setLinkLabelValue("")
    }

    // Get cursor position for positioning the popover
    const { view } = editor
    const coords = view.coordsAtPos(from)

    // Create a virtual element for positioning
    const virtualElement = {
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
    }

    linkElementRef.current = virtualElement as any
    refs.setReference(virtualElement as any)
    setIsOpen(true)
  }

  // Helper to create internal link URL
  const createInternalLink = (documentId: string) => `internal://${documentId}`

  // Register callback for programmatic opening
  useEffect(() => {
    if (onOpenLinkDialog) {
      onOpenLinkDialog(openLinkDialog)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenLinkDialog])

  useEffect(() => {
    if (!editor) return

    const updateLinkState = () => {
      // Don't update link state if programmatically opened
      if (isProgrammaticOpen) return

      const isLinkActive = editor.isActive("link")
      const { from, to } = editor.state.selection
      const isCollapsed = from === to

      // Open popover if link is active AND selection is collapsed
      if (isLinkActive && isCollapsed && !previousLinkState.current) {
        const linkAttrs = editor.getAttributes("link")
        const href = linkAttrs.href || ""

        setLinkData({ href })

        // If href is empty, go straight to editing mode (this happens with CMD+K)
        if (href === "") {
          setIsEditing(true)
        }

        // For internal links, we'll set the input value after we fetch the document
        // For external links, set it to the href immediately
        if (!isInternalLink(href)) {
          setLinkInputValue(href)
        }

        // Find the active link element in the DOM
        const linkElement = editor.view.dom.querySelector('a[data-active="true"]') as HTMLElement

        if (!linkElement) {
          const allLinks = editor.view.dom.querySelectorAll("a")
          const activeLink = Array.from(allLinks).find(
            (link) =>
              link.classList.contains("ProseMirror-selectednode") ||
              (editor.view.coordsAtPos(editor.state.selection.from).top >= link.getBoundingClientRect().top &&
                editor.view.coordsAtPos(editor.state.selection.from).top <=
                  link.getBoundingClientRect().bottom),
          ) as HTMLElement

          linkElementRef.current = activeLink || null
        } else {
          linkElementRef.current = linkElement
        }

        if (linkElementRef.current) {
          refs.setReference(linkElementRef.current)
          setIsOpen(true)
        }
      } else if ((!isLinkActive || !isCollapsed) && previousLinkState.current) {
        // Close popover if link becomes inactive OR if user starts selecting text
        setIsOpen(false)
        setIsEditing(false)
        setLinkData(null)
        linkElementRef.current = null
      }

      previousLinkState.current = isLinkActive && isCollapsed
    }

    editor.on("selectionUpdate", updateLinkState)
    editor.on("transaction", updateLinkState)

    return () => {
      editor.off("selectionUpdate", updateLinkState)
      editor.off("transaction", updateLinkState)
    }
  }, [editor, refs, isProgrammaticOpen])

  // Update linkInputValue when internalDocument loads
  useEffect(() => {
    if (linkData && isInternalLink(linkData.href) && internalDocument) {
      setLinkInputValue(internalDocument.title || "")
    }
  }, [linkData, internalDocument])

  const handleLinkSubmit = () => {
    // Skip if we're currently processing a menu selection
    if (isProcessingSelection.current) {
      return
    }

    const trimmedUrlValue = linkInputValue.trim()
    const trimmedLabelValue = linkLabelValue.trim()

    // Validate inputs for URL entry
    if (isProgrammaticOpen && !hasSelection && !trimmedLabelValue) {
      alert("Please enter a label for the link.")
      return
    }

    if (!trimmedUrlValue) {
      alert("Please enter a URL or select a document from the list.")
      return
    }

    // Create link with URL
    if (isProgrammaticOpen) {
      const label = hasSelection ? linkLabelValue : trimmedLabelValue
      if (hasSelection) {
        editor.chain().focus().setLink({ href: trimmedUrlValue }).run()
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: { href: trimmedUrlValue } }],
          })
          .run()
      }
    } else {
      setLinkInEditor(trimmedUrlValue)
    }

    closeEditingMode()
  }

  const handleDocumentSelect = (documentId: string) => {
    // Mark that we're processing a selection to prevent handleLinkSubmit from also firing
    isProcessingSelection.current = true

    const href = createInternalLink(documentId)

    if (isProgrammaticOpen) {
      // Get the document title for the label
      const doc = searchResults?.find((d) => d.id === documentId)
      const label = doc?.title || "Untitled document"

      if (hasSelection) {
        // Replace selection with link
        editor.chain().focus().setLink({ href }).run()
      } else {
        // Insert new link at cursor
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: { href } }],
          })
          .run()
      }
    } else {
      setLinkInEditor(href)
    }

    closeEditingMode()

    // Reset the flag after a short delay to ensure any pending events are ignored
    setTimeout(() => {
      isProcessingSelection.current = false
    }, 100)
  }

  const navigate = useNavigate({ from: "/w/$organizationSlug" })

  const handleOpenLink = () => {
    if (!linkData) return

    if (isInternalLink(linkData.href)) {
      const documentId = extractDocumentIdFromInternalLink(linkData.href)
      if (documentId) {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: { id: documentId },
        })
      }
    } else {
      window.open(linkData.href, "_blank", "noopener,noreferrer")
    }
  }

  if (!isOpen || !linkData) {
    return null
  }

  const domain = extractDomain(linkData.href)
  const isInternal = isInternalLink(linkData.href)

  const displayText = isInternal
    ? internalDocument?.title || "Loading..."
    : !isValidURL(linkData.href)
      ? "Invalid link"
      : linkData.href

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className="z-50 bg-white ring ring-black/10 rounded-lg shadow-lg p-2 flex flex-col "
        >
          {isEditing ? (
            <div className="gap-y-2 flex flex-col w-[300px]">
              <TextField className="flex flex-col outline-none placeholder-gray-500">
                <Label className="text-xs text-gray-600 px-1">Text</Label>
                <Input
                  value={linkLabelValue}
                  onChange={(e) => setLinkLabelValue(e.target.value)}
                  placeholder="Enter link text..."
                  className="grow px-2 py-1 text-sm border border-gray-200 rounded w-full"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleLinkSubmit()
                    }
                  }}
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
                        autoFocus
                        placeholder="Search or paste a link"
                        className="border-gray-200 p-1.5 border rounded-md leading-5 text-gray-900 bg-transparent outline-hidden text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleLinkSubmit()
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            closeEditingMode()
                          }
                        }}
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
                      className="flex items-center gap-2 w-full p-1.5 text-left text-sm rounded hover:bg-gray-100 cursor-pointer data-[focused]:bg-gray-100"
                      onAction={() => handleDocumentSelect(doc.id)}
                    >
                      <DocumentIcon className="size-3.5 text-gray-500 shrink-0" />
                      <span className="truncate">{doc.title || "Untitled document"}</span>
                    </MenuItem>
                  ))}
                </Menu>
              </Autocomplete>
            </div>
          ) : (
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
                      e.currentTarget.style.display = "none"
                    }}
                  />
                ) : null}
                <div className="text-xs text-gray-700 truncate" title={displayText}>
                  {displayText}
                </div>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex gap-x-0.5">
                <LinkPopoverButton
                  title={isInternal ? "Open document" : "Open link in new tab"}
                  icon={isInternal ? DocumentIcon : ExternalLinkIcon}
                  onPress={handleOpenLink}
                >
                  {isInternal ? "Open document" : "Open in new tab"}
                </LinkPopoverButton>
                <LinkPopoverButton title="Edit link" icon={EditIcon} onPress={() => setIsEditing(true)}>
                  Edit link
                </LinkPopoverButton>
                <LinkPopoverButton
                  title="Remove link"
                  icon={UnlinkIcon}
                  onPress={() => editor.chain().focus().unsetLink().run()}
                >
                  Remove link
                </LinkPopoverButton>
              </div>
            </div>
          )}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}

type LinkPopoverButtonProps = ButtonProps & {
  title: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

function LinkPopoverButton(props: LinkPopoverButtonProps) {
  const { className, isDisabled, ...rest } = props
  const defaultClassName = `p-1 rounded hover:bg-gray-100 ${
    isDisabled ? "opacity-50 cursor-not-allowed" : ""
  }`

  return (
    <TooltipTrigger delay={500}>
      <Button {...rest} className={defaultClassName} isDisabled={isDisabled}>
        <props.icon className="size-3.5 text-gray-700" />
      </Button>
      <Tooltip>{props.title}</Tooltip>
    </TooltipTrigger>
  )
}
