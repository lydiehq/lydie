import { DocumentTree } from "./DocumentTree";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { Button as RACButton } from "react-aria-components";
import { Button } from "../generic/Button";
import { Tooltip, TooltipTrigger } from "../generic/Tooltip";
import { Link, useSearch } from "@tanstack/react-router";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { SidebarIcon } from "./SidebarIcon";
import { useSetAtom } from "jotai";
import { commandMenuStateAtom } from "@/stores/command-menu";
import {
  Search,
  FilePlus,
  FolderPlus,
  Home,
  LogIn,
  AlertCircle,
} from "lucide-react";
import { Separator } from "../generic/Separator";
import { Eyebrow } from "../generic/Eyebrow";
import { sidebarItemStyles } from "./Sidebar";

type Props = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function SidebarUnauthed({ isCollapsed, onToggle }: Props) {
  const { createDocument, createFolder } = useDocumentActions();
  const setCommandMenuState = useSetAtom(commandMenuStateAtom);
  const { tree } = useSearch({
    strict: false,
  });

  const handleSearchClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: "search",
    });
  };

  const handleQuickActionClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: undefined,
    });
  };

  return (
    <div className="flex flex-col grow max-h-screen overflow-hidden">
      <div
        className={`flex justify-between items-center p-3 ${
          !isCollapsed ? "-ml-1" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">Lydie</span>
        </div>
        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              `p-1 rounded hover:bg-black/5 text-gray-700 group ${
                isCollapsed ? "hidden" : ""
              }`
            )}
            onPress={onToggle}
            aria-label="Collapse sidebar"
          >
            <SidebarIcon direction="left" collapsed={false} />
          </RACButton>
          <Tooltip>Collapse sidebar</Tooltip>
        </TooltipTrigger>
      </div>

      {/* Collapsed state content */}
      <div
        className={`h-full justify-between items-center flex flex-col p-3 ${
          !isCollapsed ? "hidden" : ""
        }`}
      >
        <div></div>
        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              "p-1 rounded hover:bg-black/5 text-gray-700 group"
            )}
            onPress={onToggle}
            aria-label="Expand sidebar"
          >
            <SidebarIcon direction="left" collapsed={true} />
          </RACButton>
          <Tooltip>Expand sidebar</Tooltip>
        </TooltipTrigger>
      </div>
      <div
        className={`flex flex-col gap-y-4 px-2 pb-2 ${
          isCollapsed ? "hidden" : ""
        } grow min-h-0`}
      >
        {/* Login banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="text-amber-600 size-4 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-900">
              You're working locally. Sign in to sync your documents across
              devices.
            </p>
          </div>
          <Link
            to="/auth"
            className="flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-700 text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <LogIn size={14} />
            Sign in or create account
          </Link>
        </div>

        <div className="flex gap-x-1 max-w-[300px]">
          <Button
            intent="secondary"
            size="sm"
            className="grow flex items-center justify-center gap-x-2"
            onPress={handleQuickActionClick}
          >
            <span className="mr-1.5">Quick Action</span>
            <div className="flex items-center">
              <kbd className="px-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded">
                ⌘
              </kbd>
              <kbd className="px-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded">
                K
              </kbd>
            </div>
          </Button>
          <Button
            intent="secondary"
            size="sm"
            onPress={handleSearchClick}
            aria-label="Search"
          >
            <Search size={14} className="text-gray-600" />
          </Button>
        </div>
        <div className="flex flex-col">
          <Link
            to="/__unauthed"
            activeOptions={{ exact: true }}
            className={sidebarItemStyles()}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Home className="text-gray-700 shrink-0 size-4" />
              <span className="truncate flex-1">Home</span>
            </div>
          </Link>
        </div>
        <Separator />
        <div className="flex flex-col gap-y-2 grow min-h-0">
          <div className="flex items-center justify-between px-2 shrink-0">
            <Eyebrow>Documents</Eyebrow>
            <div className="flex gap-x-1">
              <TooltipTrigger delay={500}>
                <RACButton
                  className="p-1 rounded hover:bg-black/5 text-gray-600 "
                  onPress={() => createDocument(tree)}
                  aria-label="Create new document"
                >
                  <FilePlus size={16} />
                </RACButton>
                <Tooltip>Add document</Tooltip>
              </TooltipTrigger>
              <TooltipTrigger delay={500}>
                <RACButton
                  className="p-1 rounded hover:bg-black/5 text-gray-600"
                  onPress={createFolder}
                  aria-label="Create new folder"
                >
                  <FolderPlus size={16} />
                </RACButton>
                <Tooltip>Add folder</Tooltip>
              </TooltipTrigger>
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white pr-2 -mr-2">
            {/* <DocumentTree /> */}
          </div>
        </div>
      </div>
    </div>
  );
}
