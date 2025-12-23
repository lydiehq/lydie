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
import {
  commandMenuOpenAtom,
  commandMenuStateAtom,
} from "@/stores/command-menu";
import {
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
import { overlayStyles } from "../../generic/Modal";
import { Dialog } from "../../generic/Dialog";
import { cva } from "cva";
import type { MenuItem } from "./CommandMenuItem";
import { CommandMenuSection, type MenuSection } from "./CommandMenuSection";
import { CommandMenuKeyboardHelp } from "./CommandMenuKeyboardHelp";
import { SearchResults } from "./CommandMenuSearchResults";
import {
  integrationMetadata,
  type IntegrationMetadata,
} from "@lydie/integrations/client";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { useIsTrial } from "@/hooks/useIsTrial";

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

export function CommandMenu() {
  const { createDocument, createFolder, deleteDocument, publishDocument } =
    useDocumentActions();
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const z = useZero();
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const currentPage = pages[pages.length - 1];
  const isTrial = useIsTrial();

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

  // Use dynamic integration route for all integrations
  const getIntegrationRoute = (integrationType: string) =>
    `/w/$organizationId/settings/integrations/${integrationType}`;

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
      // Only show publish in authenticated mode
      if (!isTrial) {
        favoritesItems.push({
          id: "publish",
          label: "Publish document",
          icon: Plus,
          action: () => {
            if (currentDocument) {
              publishDocument(currentDocument.id);
            }
          },
        });
      }
      favoritesItems.push({
        id: "delete-document",
        label: "Delete document",
        icon: Plus,
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
      // Hide assistant, integrations, import in trial mode
      ...(!isTrial ? [{
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
      }] : []),
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
      ...(!isTrial ? [{
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
      }] : []),
      ...(!isTrial ? [{
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
      }] : []),
      ...(!isTrial ? [{
        id: "integrations",
        label: "Go to integrations",
        icon: Plug,
        action: () => {
          navigate({
            to: "/w/$organizationId/settings/integrations",
            params: {
              organizationId: organization?.id as string,
            },
            search: {
              success: false,
              error: undefined,
              connectionId: undefined,
            },
          });
        },
      }] : []),
      ...(!isTrial ? integrationMetadata.map((integration: IntegrationMetadata) => ({
        id: `integration-${integration.id}`,
        label: `Go to ${integration.name} integration`,
        iconUrl: getIntegrationIconUrl(integration.id) || undefined,
        action: () => {
          navigate({
            to: getIntegrationRoute(integration.id),
            params: {
              organizationId: organization?.id as string,
            },
          });
        },
      })) : []),
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
    isTrial,
    publishDocument,
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
                      <CommandMenuSection
                        key={section.id}
                        section={section}
                        onSelect={(item) => {
                          // Don't close dialog for "search" - it navigates to a sub-page
                          if (item.id === "search") {
                            item.action();
                          } else {
                            handleCommand(item.action);
                          }
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Search page */}
                {currentPage === "search" && (
                  <SearchResults
                    searchDocuments={[...searchDocuments]}
                    searchFolders={[...searchFolders]}
                    integrationLinks={integrationLinks}
                    organizationId={organization?.id as string}
                    onNavigate={(options) =>
                      handleCommand(() => navigate(options))
                    }
                  />
                )}
              </Command.List>
            </Command>
            <CommandMenuKeyboardHelp showBack={pages.length > 0} />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
