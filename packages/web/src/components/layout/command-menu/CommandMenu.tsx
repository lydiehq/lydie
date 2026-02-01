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
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { overlayStyles } from "@lydie/ui/components/generic/Modal";
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
import { commandMenuOpenAtom } from "@/stores/command-menu";
import { confirmDialog } from "@/stores/confirm-dialog";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

import type { MenuItem } from "./CommandMenuItem";

import { CommandMenuDocumentItem } from "./CommandMenuDocumentItem";
import { CommandMenuKeyboardHelp } from "./CommandMenuKeyboardHelp";
import { CommandMenuSection, type MenuSection } from "./CommandMenuSection";

const modalStyles = cva({
  base: "w-full max-w-xl max-h-full rounded-xl shadow-popover bg-clip-padding overflow-hidden",
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
  const [search, setSearch] = useState("");

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

  // Always search documents based on current search input
  const [searchData] = useQuery(
    queries.organizations.searchDocuments({
      organizationId: organization.id,
      searchTerm: search,
    }),
  );

  const searchDocuments = searchData?.documents || [];

  const [isOpen, setOpen] = useAtom(commandMenuOpenAtom);

  const handleOpenChange = useCallback(
    (newIsOpen: boolean) => {
      if (!newIsOpen && isOpen) {
        setSearch("");
      }
      setOpen(newIsOpen);
    },
    [isOpen, setOpen],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // If the event was already handled (e.g., by an editor with selected text), don't handle it here
        if (e.defaultPrevented) return;

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
        destructive: true,
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
    publishDocument,
  ]);

  // Create document menu items from search results
  // Only show if search has at least 2 characters, capped at 10 results
  const documentItems = useMemo(() => {
    if (search.length < 2) {
      return [];
    }
    return searchDocuments.slice(0, 10).map((doc) => ({
      id: `doc-${doc.id}`,
      documentId: doc.id,
      label: doc.title || "Untitled Document",
      action: () => {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: {
            organizationSlug: organization.slug,
            id: doc.id,
          },
        });
      },
    }));
  }, [searchDocuments, navigate, organization.slug, search.length]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable
      className={overlayStyles}
    >
      <Modal className={modalStyles}>
        <Dialog className="flex flex-col bg-gray-50">
          <Command>
            <div className="flex items-center border-b border-gray-100 px-3">
              <SearchFilled className="size-4 text-gray-400 mr-2" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command or search..."
                className="flex h-11 w-full border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto overflow-x-hidden p-2">
              <Command.Empty className="py-6 text-center text-sm text-gray-500">
                No results found.
              </Command.Empty>

              {/* Menu sections - always shown */}
              {menuSections.map((section) => (
                <CommandMenuSection
                  key={section.id}
                  section={section}
                  onSelect={(item) => handleCommand(item.action)}
                />
              ))}

              {/* Quick results - document search results at the bottom */}
              {documentItems.length > 0 && (
                <Command.Group
                  heading={
                    <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 text-left">
                      Quick results
                    </div>
                  }
                >
                  {documentItems.map((item) => (
                    <CommandMenuDocumentItem
                      key={item.id}
                      item={item}
                      onSelect={(docItem) => handleCommand(docItem.action)}
                    />
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
          <CommandMenuKeyboardHelp />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
