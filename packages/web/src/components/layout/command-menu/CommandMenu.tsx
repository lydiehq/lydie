import {
  AddRegular,
  ArrowUploadRegular,
  BotRegular,
  HomeFilled,
  PaymentRegular,
  PlugConnectedRegular,
  SearchFilled,
  SettingsRegular,
} from "@fluentui/react-icons";
import { type IntegrationMetadata, integrationMetadata } from "@lydie/integrations/client";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Command } from "cmdk";
import { cva } from "cva";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ModalOverlay } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { commandMenuOpenAtom, commandMenuStateAtom } from "@/stores/command-menu";
import { confirmDialog } from "@/stores/confirm-dialog";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

import type { MenuItem } from "./CommandMenuItem";

import { Dialog } from "../../generic/Dialog";
import { overlayStyles } from "../../generic/Modal";
import { CommandMenuKeyboardHelp } from "./CommandMenuKeyboardHelp";
import { SearchResults } from "./CommandMenuSearchResults";
import { CommandMenuSection, type MenuSection } from "./CommandMenuSection";

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
  const { createDocument, deleteDocument, publishDocument } = useDocumentActions();
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
          organizationId: organization.id,
          documentId: currentDocumentId,
        })
      : queries.documents.byId({
          organizationId: organization.id,
          documentId: "non-existent",
        }),
  );

  const [searchData] = useQuery(
    currentPage === "search"
      ? queries.organizations.searchDocuments({
          organizationId: organization.id,
          searchTerm: search,
        })
      : queries.organizations.searchDocuments({
          organizationId: organization.id,
          searchTerm: "",
        }),
  );

  const searchDocuments = searchData?.documents || [];

  const [integrationLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization.id,
    }),
  );

  const [isOpen, setOpen] = useAtom(commandMenuOpenAtom);
  const [commandMenuState, setCommandMenuState] = useAtom(commandMenuStateAtom);

  const handleOpenChange = useCallback(
    (newIsOpen: boolean) => {
      if (newIsOpen && !isOpen) {
        if (commandMenuState.initialPage) {
          setPages([commandMenuState.initialPage]);
          setCommandMenuState({
            ...commandMenuState,
            initialPage: undefined,
          });
        }
      } else if (!newIsOpen && isOpen) {
        setPages([]);
        setSearch("");
      }

      setOpen(newIsOpen);
    },
    [isOpen, commandMenuState, setCommandMenuState, setOpen],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement;
        const isInEditor = target.closest(".ProseMirror");
        if (isInEditor) return;

        e.preventDefault();
        handleOpenChange(!isOpen);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleOpenChange]);

  const handleCommand = useCallback(
    (action: () => void) => {
      action();
      handleOpenChange(false);
    },
    [handleOpenChange],
  );

  const getIntegrationRoute = (integrationType: string) =>
    `/w/$organizationSlug/settings/integrations/${integrationType}`;

  const menuSections = useMemo<MenuSection[]>(() => {
    const favoritesItems: MenuItem[] = [];

    favoritesItems.push({
      id: "create-document",
      label: "Create new document…",
      icon: AddRegular,
      action: async () => {
        createDocument();
      },
    });

    if (currentDocument) {
      favoritesItems.push({
        id: "publish",
        label: "Publish document",
        icon: AddRegular,
        action: () => {
          if (currentDocument) {
            publishDocument(currentDocument.id);
          }
        },
      });
      favoritesItems.push({
        id: "delete-document",
        label: "Delete document",
        icon: AddRegular,
        action: () => {
          if (currentDocumentId) {
            const documentTitle = currentDocument.title || "Untitled Document";
            confirmDialog({
              title: `Delete "${documentTitle}"`,
              message: "This action cannot be undone. This document will be permanently deleted.",
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
        label: "Search documents…",
        icon: SearchFilled,
        action: () => {
          setPages([...pages, "search"]);
          setSearch(""); // Clear search when entering search page
        },
      },
      {
        id: "go-home",
        label: "Go home",
        icon: HomeFilled,
        action: () => {
          navigate({
            to: "/w/$organizationSlug",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "go-assistant",
        label: "Go to assistant",
        icon: BotRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/assistant",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "organization-settings",
        label: "Go to organization settings",
        icon: SettingsRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "billing",
        label: "Go to billing settings",
        icon: PaymentRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/billing",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "mdx-import",
        label: "Go to import settings",
        icon: ArrowUploadRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/import",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "integrations",
        label: "Go to integrations",
        icon: PlugConnectedRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/integrations",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      ...integrationMetadata.map((integration: IntegrationMetadata) => ({
        id: `integration-${integration.id}`,
        label: `Go to ${integration.name} integration`,
        iconUrl: getIntegrationIconUrl(integration.id) || undefined,
        action: () => {
          navigate({
            to: getIntegrationRoute(integration.id),
          });
        },
      })),
      {
        id: "create-organization",
        label: "Create new organization",
        icon: AddRegular,
        action: () => {
          navigate({
            to: "/new",
          });
        },
      },
    ];

    const sections: MenuSection[] = [];

    sections.push(
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
    );

    return sections;
  }, [
    createDocument,
    currentDocument,
    currentDocumentId,
    deleteDocument,
    navigate,
    organization.id,
    organization.slug,
    pages,
    z,
    handleOpenChange,
    publishDocument,
  ]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable
      className={overlayStyles}
    >
      <Modal className={modalStyles}>
        <Dialog className="flex flex-col bg-gray-50">
          <Command
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Backspace" && !search)) {
                e.preventDefault();
                setPages((pages) => pages.slice(0, -1));
              }
            }}
          >
            <div className="flex items-center border-b border-gray-100 px-3">
              <SearchFilled className="size-4 text-gray-400 mr-2" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={
                  currentPage === "search" ? "Search documents..." : "Type a command or search..."
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
                  integrationLinks={integrationLinks}
                  organizationId={organization.id}
                  onNavigate={(options) => handleCommand(() => navigate(options))}
                />
              )}
            </Command.List>
          </Command>
          <CommandMenuKeyboardHelp showBack={pages.length > 0} />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
