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
import { useOnboardingChecklist } from "@/hooks/use-onboarding-checklist";
import { useOnboardingSteps } from "@/hooks/use-onboarding-steps";
import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import {
  SearchIcon,
  PlusIcon,
  HomeIcon,
  BotIcon,
  SettingsIcon,
  CreditCardIcon,
  UploadIcon,
  PlugIcon,
} from "@/icons";
import { ModalOverlay, Modal } from "react-aria-components";
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
  const { createDocument, deleteDocument, publishDocument } =
    useDocumentActions();
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
        })
  );

  // Search documents using Zero - only when on search page
  const [searchData] = useQuery(
    currentPage === "search"
      ? queries.organizations.searchDocuments({
          organizationId: organization.id,
          searchTerm: search,
        })
      : queries.organizations.searchDocuments({
          organizationId: organization.id,
          searchTerm: "",
        })
  );

  const searchDocuments = searchData?.documents || [];

  // Load integration links to show appropriate icons
  const [integrationLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization.id,
    })
  );

  const [isOpen, setOpen] = useAtom(commandMenuOpenAtom);
  const [commandMenuState, setCommandMenuState] = useAtom(commandMenuStateAtom);
  const { setChecked } = useOnboardingChecklist();
  const { currentStep } = useOnboardingSteps();

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

  // Mark command menu as checked when opened during onboarding
  useEffect(() => {
    if (isOpen && currentStep === "documents") {
      setChecked("documents:open-command-menu", true);
    }
  }, [isOpen, currentStep, setChecked]);

  // Mark search menu as checked when search page is active during onboarding
  useEffect(() => {
    if (isOpen && currentPage === "search" && currentStep === "documents") {
      setChecked("documents:search-menu", true);
    }
  }, [isOpen, currentPage, currentStep, setChecked]);

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
    `/w/$organizationSlug/settings/integrations/${integrationType}`;

  const menuSections = useMemo<MenuSection[]>(() => {
    const favoritesItems: MenuItem[] = [];

    // Add special onboarding guide item during documents onboarding step
    if (currentStep === "documents") {
      favoritesItems.push({
        id: "create-onboarding-guide",
        label: "✨ Create Interactive Guide (Recommended)",
        icon: PlusIcon,
        action: async () => {
          try {
            // Generate IDs on the client side
            const parentId = createId();
            const childId = createId();
            
            await z.mutate(
              mutators.document.createOnboardingGuide({
                organizationId: organization.id,
                parentId,
                childId,
              })
            );
            
            // Mark checklist items as complete
            setChecked("documents:create-document", true);
            setChecked("documents:explore-editor", true);
            
            // Navigate to the parent document
            navigate({
              from: "/w/$organizationSlug",
              to: "/w/$organizationSlug/$id",
              params: { id: parentId, organizationSlug: organization.slug || "" },
            });
          } catch (error) {
            console.error("Failed to create onboarding guide:", error);
          }
        },
        customClassName:
          "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-3 text-sm outline-none data-[selected=true]:bg-blue-100 data-[selected=true]:text-blue-950 text-blue-700 bg-blue-50 border border-blue-200 transition-colors duration-150 font-medium",
      });
    }

    favoritesItems.push({
      id: "create-document",
      label: "Create new document…",
      icon: PlusIcon,
      action: () => {
        createDocument();
        if (currentStep === "documents") {
          setChecked("documents:create-document", true);
        }
      },
    });

    if (currentDocument) {
      favoritesItems.push({
        id: "publish",
        label: "Publish document",
        icon: PlusIcon,
        action: () => {
          if (currentDocument) {
            publishDocument(currentDocument.id);
          }
        },
      });
      favoritesItems.push({
        id: "delete-document",
        label: "Delete document",
        icon: PlusIcon,
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
        label: "Search documents…",
        icon: SearchIcon,
        action: () => {
          setPages([...pages, "search"]);
          setSearch(""); // Clear search when entering search page
        },
      },
      {
        id: "go-home",
        label: "Go home",
        icon: HomeIcon,
        action: () => {
          navigate({
            to: "/w/$organizationSlug",
            params: {
              organizationSlug: organization?.slug as string,
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
        icon: BotIcon,
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
        icon: SettingsIcon,
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
        icon: CreditCardIcon,
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
        icon: UploadIcon,
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
        icon: PlugIcon,
        action: () => {
          navigate({
            to: "/w/$organizationSlug/settings/integrations",
            params: {
              organizationSlug: organization?.slug as string,
            },
            search: {
              success: false,
              error: undefined,
              connectionId: undefined,
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
        icon: PlusIcon,
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
    currentDocument,
    currentDocumentId,
    deleteDocument,
    navigate,
    organization.id,
    organization.slug,
    pages,
    z,
    currentStep,
    setChecked,
  ]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={setOpen}
      isDismissable
      className={overlayStyles}
    >
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
              <SearchIcon className="size-4 text-gray-400 mr-2" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                autoFocus
                placeholder={
                  currentPage === "search"
                    ? "Search documents..."
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
                  integrationLinks={integrationLinks}
                  organizationId={organization.id}
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
  );
}
