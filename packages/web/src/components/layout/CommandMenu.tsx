import {
  AddRegular,
  ArrowDownloadRegular,
  ArrowUploadRegular,
  BotRegular,
  CubeRegular,
  DatabaseRegular,
  DocumentCopyRegular,
  HomeFilled,
  PaymentRegular,
  PlugConnectedRegular,
  SearchFilled,
  SettingsRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import { type IntegrationMetadata, integrationMetadata } from "@lydie/integrations/client";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Dialog,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  SearchField,
  Text,
  useFilter,
} from "react-aria-components";

import { openBackgroundTabAtom } from "@/atoms/tabs";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { commandMenuOpenAtom } from "@/stores/command-menu";
import { confirmDialog } from "@/stores/confirm-dialog";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { isAdmin } from "@/utils/admin";

interface MenuItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  iconUrl?: string;
  action: () => void;
  destructive?: boolean;
}

interface MenuSectionType {
  id: string;
  heading: string;
  items: MenuItem[];
}

interface DocumentItem {
  id: string;
  documentId: string;
  label: string;
  action: () => void;
}

interface CollectionItem {
  id: string;
  collectionId: string;
  label: string;
  handle: string;
  action: () => void;
}

export function CommandMenu() {
  const { createDocument, deleteDocument, publishDocument } = useDocumentActions();
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);
  const [search, setSearch] = useState("");
  const openBackgroundTab = useSetAtom(openBackgroundTabAtom);

  const [isOpen, setOpen] = useAtom(commandMenuOpenAtom);

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

  // Search documents based on current search input
  const [searchData] = useQuery(
    queries.organizations.searchDocuments({
      organizationId: organization.id,
      searchTerm: search,
    }),
  );

  const searchDocuments = useMemo(() => searchData?.documents || [], [searchData?.documents]);
  const [collectionsData] = useQuery(
    queries.collections.byOrganization({
      organizationId: organization.id,
    }),
  );

  const { contains } = useFilter({ sensitivity: "base" });
  const filter = (textValue: string, inputValue: string) => contains(textValue, inputValue);

  const handleOpenChange = useCallback(
    (newIsOpen: boolean) => {
      if (!newIsOpen && isOpen) {
        setTimeout(() => setSearch(""), 150);
      }
      setOpen(newIsOpen);
    },
    [isOpen, setOpen],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
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

  // Build menu sections
  const menuSections = useMemo<MenuSectionType[]>(() => {
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
        id: "settings-general",
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
        id: "settings-profile",
        label: "Go to profile settings",
        icon: SettingsRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/profile",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "settings-preferences",
        label: "Go to preferences settings",
        icon: SettingsRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/user",
            params: {
              organizationSlug: organization?.slug as string,
            },
          });
        },
      },
      {
        id: "settings-ai",
        label: "Go to AI settings",
        icon: SparkleRegular,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/ai",
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
      ...(userIsAdmin
        ? [
            {
              id: "settings-components",
              label: "Go to components settings",
              icon: CubeRegular,
              action: () => {
                navigate({
                  to: "/w/$organizationSlug/settings/components",
                  params: {
                    organizationSlug: organization?.slug as string,
                  },
                });
              },
            },
            {
              id: "settings-templates",
              label: "Go to templates settings",
              icon: DocumentCopyRegular,
              action: () => {
                navigate({
                  to: "/w/$organizationSlug/settings/templates",
                  params: {
                    organizationSlug: organization?.slug as string,
                  },
                });
              },
            },
            {
              id: "settings-export-import",
              label: "Go to export & import settings",
              icon: ArrowDownloadRegular,
              action: () => {
                navigate({
                  to: "/w/$organizationSlug/settings/export-import",
                  params: {
                    organizationSlug: organization?.slug as string,
                  },
                });
              },
            },
            {
              id: "settings-admin",
              label: "Go to admin settings",
              icon: SettingsRegular,
              action: () => {
                navigate({
                  to: "/w/$organizationSlug/settings/admin",
                  params: {
                    organizationSlug: organization?.slug as string,
                  },
                });
              },
            },
          ]
        : []),
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
    currentDocument,
    currentDocumentId,
    deleteDocument,
    navigate,
    organization.slug,
    publishDocument,
    userIsAdmin,
  ]);

  // Handle document click - supports cmd+click to open in background
  const handleDocumentClick = useCallback(
    (e: React.MouseEvent, item: DocumentItem) => {
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+click: open in background tab without navigating or closing menu
        e.preventDefault();
        e.stopPropagation();
        openBackgroundTab({
          documentId: item.documentId,
          title: item.label,
        });
        return;
      }
      // Normal click: navigate and close menu
      handleCommand(item.action);
    },
    [handleCommand, openBackgroundTab],
  );

  const handleCollectionClick = useCallback(
    (e: React.MouseEvent, item: CollectionItem) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        openBackgroundTab({
          documentId: `collection:${item.collectionId}`,
          title: item.label,
        });
        return;
      }

      handleCommand(item.action);
    },
    [handleCommand, openBackgroundTab],
  );

  // Create document items from search results
  const documentItems = useMemo<DocumentItem[]>(() => {
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

  const collectionItems = useMemo<CollectionItem[]>(() => {
    if (search.length < 2) {
      return [];
    }

    const normalized = search.toLowerCase();
    const list = collectionsData ?? [];

    return list
      .filter((collection) => {
        const name = collection.name.toLowerCase();
        const handle = collection.handle.toLowerCase();
        return name.includes(normalized) || handle.includes(normalized);
      })
      .slice(0, 8)
      .map((collection) => ({
        id: `collection-${collection.id}`,
        collectionId: collection.id,
        label: collection.name || "Untitled Collection",
        handle: collection.handle,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/collections/$collectionId",
            params: {
              organizationSlug: organization.slug,
              collectionId: collection.id,
            },
          });
        },
      }));
  }, [collectionsData, navigate, organization.slug, search]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable
      className="fixed inset-0 z-50 h-(--visual-viewport-height,100vh) w-screen overflow-hidden bg-black/15 grid grid-rows-[1fr_auto] justify-items-center text-center sm:grid-rows-[1fr_auto_3fr] entering:fade-in entering:animate-in entering:duration-100 entering:ease-out exiting:fade-out exiting:animate-out exiting:ease-in"
    >
      <Modal className="row-start-2 bg-gray-50 text-start shadow-popover outline-none md:row-start-1 max-h-[calc(var(--visual-viewport-height)*0.8)] w-full sm:fixed sm:top-[20%] sm:left-1/2 sm:-translate-x-1/2 rounded-t-2xl md:rounded-xl sm:max-w-lg entering:slide-in-from-bottom sm:entering:zoom-in-95 sm:entering:slide-in-from-bottom-0 entering:animate-in entering:duration-100 entering:ease-out exiting:slide-out-to-bottom sm:exiting:zoom-out-95 sm:exiting:slide-out-to-bottom-0 exiting:animate-out exiting:ease-in">
        <Dialog
          aria-label="Command Menu"
          className="flex max-h-[inherit] flex-col overflow-hidden outline-none"
        >
          <Autocomplete filter={filter} inputValue={search} onInputChange={setSearch}>
            <SearchField
              aria-label="Quick search"
              className="flex w-full items-center border-b border-gray-100 px-3"
              autoFocus
            >
              <SearchFilled className="size-4 shrink-0 text-gray-400" />
              <Input
                placeholder="Type a command or search..."
                className="flex h-11 w-full min-w-0 bg-transparent px-2 py-3 text-sm outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
              />
            </SearchField>

            <Menu
              className="grid max-h-80 gap-y-2 flex-1 grid-cols-[auto_1fr] content-start overflow-y-auto p-2"
              renderEmptyState={() => (
                <div className="col-span-full flex items-center justify-center py-8 text-sm text-gray-500">
                  No results found.
                </div>
              )}
            >
              {menuSections.map((section) => (
                <MenuSection
                  key={section.id}
                  id={section.id}
                  className="col-span-full grid grid-cols-1 content-start"
                >
                  <Header className="col-span-full mb-1 px-3 text-gray-500 text-xs">
                    {section.heading}
                  </Header>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <MenuItem
                        key={item.id}
                        id={item.id}
                        textValue={item.label}
                        onAction={() => handleCommand(item.action)}
                        className={`relative flex select-none items-center gap-2 rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-75 text-gray-800 focus:bg-gray-100 focus:text-gray-950 data-focused:bg-gray-100 data-focused:text-gray-950 ${item.destructive ? "text-red-500 focus:text-red-600 data-focused:text-red-600" : ""}`}
                      >
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt=""
                            className="size-4 rounded-sm shrink-0 mr-2"
                          />
                        ) : (
                          Icon && <Icon className="size-4 text-gray-400 shrink-0 mr-2" />
                        )}
                        <Text slot="label" className="flex-1 min-w-0 truncate text-start">
                          {item.label}
                        </Text>
                      </MenuItem>
                    );
                  })}
                </MenuSection>
              ))}

              {/* Document search results */}
              {documentItems.length > 0 && (
                <MenuSection
                  id="quick-results"
                  className="col-span-full grid grid-cols-1 content-start"
                >
                  <Header className="col-span-full mb-1 px-3 text-gray-500 text-xs">
                    Quick results
                  </Header>
                  {documentItems.map((item) => (
                    <MenuItem
                      key={item.id}
                      id={item.id}
                      textValue={item.label}
                      onAction={() => handleCommand(item.action)}
                      onPointerUp={(e) =>
                        handleDocumentClick(e as unknown as React.MouseEvent, item)
                      }
                      className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-150 text-gray-800 focus:bg-gray-100 focus:text-gray-950 data-focused:bg-gray-100 data-focused:text-gray-950"
                    >
                      <DocumentThumbnailIcon size="lg" className="shrink-0 mr-2" />
                      <Text slot="label" className="flex-1 min-w-0 truncate text-start">
                        {item.label}
                      </Text>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}

              {collectionItems.length > 0 && (
                <MenuSection
                  id="quick-collection-results"
                  className="col-span-full grid grid-cols-1 content-start"
                >
                  <Header className="col-span-full mb-1 px-3 text-gray-500 text-xs">
                    Collections
                  </Header>
                  {collectionItems.map((item) => (
                    <MenuItem
                      key={item.id}
                      id={item.id}
                      textValue={item.label}
                      onAction={() => handleCommand(item.action)}
                      onPointerUp={(e) =>
                        handleCollectionClick(e as unknown as React.MouseEvent, item)
                      }
                      className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-3 text-sm outline-none transition-colors duration-150 text-gray-800 focus:bg-gray-100 focus:text-gray-950 data-focused:bg-gray-100 data-focused:text-gray-950"
                    >
                      <DatabaseRegular className="size-4 text-gray-400 shrink-0 mr-2" />
                      <div className="flex min-w-0 flex-col text-start">
                        <Text slot="label" className="truncate">
                          {item.label}
                        </Text>
                        <span className="text-xs text-gray-500 truncate">/{item.handle}</span>
                      </div>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
            </Menu>

            <div className="flex-none border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center gap-x-2">
              <div className="flex gap-x-1 items-center">
                <kbd className="inline-flex h-5 select-none items-center rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600">
                  ↑↓
                </kbd>
                Navigate
              </div>
              <div className="h-3 w-px bg-gray-200" />
              <div className="flex gap-x-1 items-center">
                <kbd className="inline-flex h-5 select-none items-center rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600">
                  ↵
                </kbd>
                Select
              </div>
            </div>
          </Autocomplete>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
