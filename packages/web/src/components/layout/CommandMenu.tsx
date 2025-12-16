import { Command } from "cmdk";
import { useEffect, useState, useMemo } from "react";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useZero } from "@/services/zero";
import { useQuery } from "@rocicorp/zero/react";
import { useOrganization } from "@/context/organization.context";
import { queries } from "@lydie/zero/queries";
import { confirmDialog } from "@/stores/confirm-dialog";
import { useAtom } from "jotai";
import { mutators } from "@lydie/zero/mutators";
import {
  commandMenuOpenAtom,
  commandMenuStateAtom,
} from "@/stores/command-menu";
import {
  FileText,
  Folder,
  Search,
  Plus,
  Home,
  Bot,
  Settings,
  CreditCard,
  Upload,
  Plug,
} from "lucide-react";
import { DialogTrigger, ModalOverlay, Modal } from "react-aria-components";
import { overlayStyles } from "../generic/Modal";
import { Dialog } from "../generic/Dialog";
import { cva } from "cva";

const modalStyles = cva({
  base: "w-full max-w-lg max-h-full rounded-lg shadow-2xl bg-clip-padding ring ring-black/10 overflow-hidden",
  variants: {
    isEntering: {
      true: "animate-in fade-in duration-75 ease-out",
    },
    isExiting: {
      true: "animate-out fade-out duration-75 ease-in",
    },
  },
});

function CommandGroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 text-left">
      {children}
    </div>
  );
}

// Helper to get icon for integration type
function getIntegrationIcon(integrationType: string | null | undefined) {
  if (!integrationType) return null;

  // For now, use a generic Plug icon, but this can be extended
  // to return specific icons for different integration types
  switch (integrationType.toLowerCase()) {
    case "github":
      // Could import a GitHub icon from lucide-react or use a custom one
      return Plug;
    case "shopify":
      return Plug;
    default:
      return Plug;
  }
}

interface MenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  action: () => void;
  className?: string;
}

interface MenuSection {
  id: string;
  heading: string;
  items: MenuItem[];
}

export function CommandMenu() {
  const { createDocument, createFolder, deleteDocument } = useDocumentActions();
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const z = useZero();
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const currentPage = pages[pages.length - 1];

  const currentDocumentId = params.id as string | undefined;
  const [currentDocument] = useQuery(
    currentDocumentId
      ? queries.documents.byId({
          organizationId: organization?.id || "",
          documentId: currentDocumentId,
        })
      : queries.documents.byId({
          organizationId: organization?.id || "",
          documentId: "non-existent",
        })
  );

  // Search documents and folders using Zero - only when on search page
  const [searchData] = useQuery(
    currentPage === "search"
      ? queries.organizations.searchDocumentsAndFolders({
          organizationId: organization?.id || "",
          searchTerm: search,
        })
      : queries.organizations.searchDocumentsAndFolders({
          organizationId: organization?.id || "",
          searchTerm: "",
        })
  );

  const searchDocuments = searchData?.documents || [];
  const searchFolders = searchData?.folders || [];

  // Load integration links to show appropriate icons
  const [integrationLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const [isOpen, setOpen] = useAtom(commandMenuOpenAtom);
  const [commandMenuState, setCommandMenuState] = useAtom(commandMenuStateAtom);

  // Initialize pages from the atom's initialPage when menu opens
  useEffect(() => {
    if (isOpen && commandMenuState.initialPage) {
      setPages([commandMenuState.initialPage]);
      setCommandMenuState({
        ...commandMenuState,
        initialPage: undefined,
      });
    }
  }, [isOpen, commandMenuState.initialPage]);

  // Reset pages and search when menu closes
  useEffect(() => {
    if (!isOpen) {
      setPages([]);
      setSearch("");
    }
  }, [isOpen]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement;
        const isInEditor = target.closest(".ProseMirror");
        if (isInEditor) return;

        e.preventDefault();
        setOpen(!isOpen);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  const handleCommand = (action: () => void) => {
    action();
    setOpen(false);
  };

  const itemClassName =
    "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800";

  // Build menu sections
  const menuSections = useMemo<MenuSection[]>(() => {
    const favoritesItems: MenuItem[] = [
      {
        id: "create-document",
        label: "Create new document…",
        icon: Plus,
        action: createDocument,
      },
      {
        id: "create-folder",
        label: "Create new folder…",
        icon: Plus,
        action: createFolder,
      },
    ];

    if (currentDocument) {
      favoritesItems.push({
        id: "publish",
        label: currentDocument.published
          ? `Republish "${currentDocument.title || "Untitled Document"}"`
          : `Publish "${currentDocument.title || "Untitled Document"}"`,
        icon: Plus, // No icon for this action
        action: () => {
          if (currentDocument) {
            z.mutate(
              mutators.document.update({
                documentId: currentDocument.id,
                published: true,
              })
            );
          }
        },
      });
      if (currentDocument.published) {
        favoritesItems.push({
          id: "unpublish",
          label: `Unpublish "${currentDocument.title || "Untitled Document"}"`,
          icon: Plus, // No icon for this action
          action: () => {
            if (currentDocument) {
              z.mutate(
                mutators.document.update({
                  documentId: currentDocument.id,
                  published: false,
                })
              );
            }
          },
          className: `${itemClassName} data-[selected=true]:text-red-600 text-red-500`,
        });
      }
      favoritesItems.push({
        id: "delete-document",
        label: `Delete "${currentDocument.title || "Untitled Document"}"`,
        icon: Plus, // No icon for this action
        action: () => {
          if (currentDocumentId) {
            const documentTitle = currentDocument.title || "Untitled Document";
            confirmDialog({
              title: `Delete "${documentTitle}"`,
              message:
                "This action cannot be undone. This document will be permanently deleted.",
              onConfirm: () => {
                deleteDocument(currentDocumentId, true);
              },
            });
          }
        },
        className: `${itemClassName} data-[selected=true]:text-red-600 text-red-500`,
      });
    }

    const navigationItems: MenuItem[] = [
      {
        id: "search",
        label: "Search documents and folders…",
        icon: Search,
        action: () => {
          setPages([...pages, "search"]);
          setSearch(""); // Clear search when entering search page
        },
      },
      {
        id: "go-home",
        label: "Go home",
        icon: Home,
        action: () => {
          navigate({
            to: "/w/$organizationId",
            params: {
              organizationId: organization?.id as string,
            },
            search: {
              tree: undefined,
              q: undefined,
              focusSearch: undefined,
            },
          });
        },
      },
      {
        id: "go-assistant",
        label: "Go to assistant",
        icon: Bot,
        action: () => {
          navigate({
            to: "/w/$organizationId/assistant",
            params: {
              organizationId: organization?.id as string,
            },
          });
        },
      },
      {
        id: "organization-settings",
        label: "Go to organization settings",
        icon: Settings,
        action: () => {
          navigate({
            to: "/w/$organizationId/settings",
            params: {
              organizationId: organization?.id as string,
            },
          });
        },
      },
      {
        id: "billing",
        label: "Go to billing settings",
        icon: CreditCard,
        action: () => {
          navigate({
            to: "/w/$organizationId/settings/billing",
            params: {
              organizationId: organization?.id as string,
            },
          });
        },
      },
      {
        id: "mdx-import",
        label: "Go to import settings",
        icon: Upload,
        action: () => {
          navigate({
            to: "/w/$organizationId/settings/import",
            params: {
              organizationId: organization?.id as string,
            },
          });
        },
      },
      {
        id: "integrations",
        label: "Go to integrations",
        icon: Plug,
        action: () => {
          navigate({
            to: "/w/$organizationId/settings/integrations",
          });
        },
      },
      {
        id: "create-organization",
        label: "Create new organization",
        icon: Plus,
        action: () => {
          navigate({
            to: "/onboarding",
          });
        },
      },
    ];

    return [
      {
        id: "favorites",
        heading: "Favorites",
        items: favoritesItems,
      },
      {
        id: "navigation",
        heading: "Navigation",
        items: navigationItems,
      },
    ];
  }, [
    createDocument,
    createFolder,
    currentDocument,
    currentDocumentId,
    deleteDocument,
    navigate,
    organization?.id,
    pages,
    z,
  ]);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <ModalOverlay isDismissable className={overlayStyles}>
        <Modal className={modalStyles}>
          <Dialog className="flex flex-col bg-gray-50">
            <Command
              onKeyDown={(e) => {
                // Escape goes to previous page
                // Backspace goes to previous page when search is empty
                if (e.key === "Escape" || (e.key === "Backspace" && !search)) {
                  e.preventDefault();
                  setPages((pages) => pages.slice(0, -1));
                }
              }}
            >
              <div className="flex items-center border-b border-gray-100 px-3">
                <Search className="size-4 text-gray-400 mr-2" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  autoFocus
                  placeholder={
                    currentPage === "search"
                      ? "Search documents and folders..."
                      : "Type a command or search..."
                  }
                  className="flex h-11 w-full border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <Command.List className="max-h-72 overflow-y-auto overflow-x-hidden p-2">
                <Command.Empty className="py-6 text-center text-sm text-gray-500">
                  No results found.
                </Command.Empty>

                {/* Main page */}
                {!currentPage && (
                  <>
                    {/* Menu sections */}
                    {menuSections.map((section) => (
                      <Command.Group
                        key={section.id}
                        heading={
                          <CommandGroupHeading>
                            {section.heading}
                          </CommandGroupHeading>
                        }
                      >
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Command.Item
                              key={item.id}
                              onSelect={() => {
                                // Don't close dialog for "search" - it navigates to a sub-page
                                if (item.id === "search") {
                                  item.action();
                                } else {
                                  handleCommand(item.action);
                                }
                              }}
                              className={item.className || itemClassName}
                            >
                              {Icon && (
                                <Icon className="size-4 text-gray-400 mr-2" />
                              )}
                              <span className="truncate">{item.label}</span>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    ))}
                  </>
                )}

                {/* Search page */}
                {currentPage === "search" && (
                  <Command.Group
                    heading={
                      <CommandGroupHeading>Search Results</CommandGroupHeading>
                    }
                  >
                    {searchFolders.map((folder) => {
                      const link = integrationLinks?.find(
                        (l) => l.id === folder.integration_link_id
                      );
                      const IntegrationIcon = link?.connection
                        ? getIntegrationIcon(link.connection.integration_type)
                        : null;

                      return (
                        <Command.Item
                          key={`search-folder-${folder.id}`}
                          value={`search-folder-${folder.id}-${folder.name}`}
                          onSelect={() =>
                            handleCommand(() => {
                              navigate({
                                to: "/w/$organizationId",
                                params: {
                                  organizationId: organization?.id as string,
                                },
                                search: {
                                  tree: folder.id,
                                  q: undefined,
                                  focusSearch: undefined,
                                },
                              });
                            })
                          }
                          className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800"
                        >
                          <div className="flex items-center gap-1 mr-2">
                            <Folder className="size-4 text-gray-400" />
                            {IntegrationIcon && (
                              <IntegrationIcon className="size-3 text-blue-500" />
                            )}
                          </div>
                          <span className="truncate">{folder.name}</span>
                        </Command.Item>
                      );
                    })}
                    {searchDocuments.map((doc) => {
                      const link = integrationLinks?.find(
                        (l) => l.id === doc.integration_link_id
                      );
                      const IntegrationIcon = link?.connection
                        ? getIntegrationIcon(link.connection.integration_type)
                        : null;

                      return (
                        <Command.Item
                          key={`search-document-${doc.id}`}
                          value={`search-document-${doc.id}-${
                            doc.title || "Untitled Document"
                          }`}
                          onSelect={() =>
                            handleCommand(() => {
                              navigate({
                                to: "/w/$organizationId/$id",
                                params: {
                                  organizationId: organization?.id as string,
                                  id: doc.id,
                                },
                              });
                            })
                          }
                          className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800"
                        >
                          <div className="flex items-center gap-1 mr-2">
                            <FileText className="size-4 text-gray-400" />
                            {IntegrationIcon && (
                              <IntegrationIcon className="size-3 text-blue-500" />
                            )}
                          </div>
                          <span className="truncate">
                            {doc.title || "Untitled Document"}
                          </span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
            <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center gap-x-2">
              <div className="flex gap-x-1 items-center">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
                  ↑↓
                </kbd>
                Navigate
              </div>
              <div className="h-3 w-px bg-gray-200" />
              <div className="flex gap-x-1 items-center">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
                  ↵
                </kbd>
                Select
              </div>
              {pages.length > 0 && (
                <>
                  <div className="h-3 w-px bg-gray-200" />
                  <div className="flex gap-x-1 items-center">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 opacity-100">
                      Esc
                    </kbd>
                    Back
                  </div>
                </>
              )}
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
