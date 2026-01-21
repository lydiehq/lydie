import { DocumentChat, type DocumentChatRef } from "./DocumentChat"
import { queries } from "@lydie/zero/queries"
import { Button } from "react-aria-components"
import { AlertCircleIcon, CreateIcon } from "@/icons"
import type { ComponentType, SVGProps } from "react"
import { SidebarIcon } from "../layout/SidebarIcon"
import { type DocumentEditorHookResult } from "@/lib/editor/document-editor"
import { useState, forwardRef } from "react"
import clsx from "clsx"
import { Tooltip, TooltipTrigger } from "../generic/Tooltip"
import { createId } from "@lydie/core/id"
import type { QueryResultType } from "@rocicorp/zero"
import { isAdmin } from "@/utils/admin"
import { useAuth } from "@/context/auth.context"

type Props = {
  contentEditor: DocumentEditorHookResult
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>
  isCollapsed: boolean
  onToggle: () => void
}

export const EditorSidebar = forwardRef<DocumentChatRef, Props>(
  ({ contentEditor, doc, isCollapsed, onToggle }, ref) => {
    const { user } = useAuth()

    const [currentConversationId, setCurrentConversationId] = useState<string>(createId())

    const createNewConversation = () => {
      setCurrentConversationId(createId())
    }

    return (
      <div className="overflow-hidden flex flex-col border-l border-black/8 bg-surface rounded-r-lg size-full">
        <div
          className={clsx(
            "flex justify-between shrink-0 border-b border-black/8",
            isCollapsed ? "h-full flex-col p-1.5" : "h-10 items-center flex-row p-3",
          )}
        >
          {!isCollapsed && (
            <span
              className="text-sm font-medium text-gray-700 truncate"
              title="New Conversation"
            >
              New Conversation
            </span>
          )}
          <div className={clsx("flex", isCollapsed ? "flex-col gap-y-1" : "flex-row gap-x-0.5")}>
            {isAdmin(user) && (
              <SidebarButton
                icon={AlertCircleIcon}
                tooltip="Log current conversation"
                onPress={() => {
                  console.dir(currentConversation)
                }}
                isCollapsed={isCollapsed}
              />
            )}
            <SidebarButton
              icon={CreateIcon}
              tooltip="New Conversation"
              onPress={createNewConversation}
              isCollapsed={isCollapsed}
            />
            <TooltipTrigger>
              <Button
                className={clsx(
                  "rounded hover:bg-gray-100 text-gray-700 group flex flex-col items-center justify-center",
                  isCollapsed ? "aspect-square" : "p-1",
                )}
                onPress={onToggle}
                aria-label="Toggle Sidebar"
              >
                <SidebarIcon direction="right" collapsed={isCollapsed} />
              </Button>
              <Tooltip placement={isCollapsed ? "left" : undefined}>Toggle Sidebar</Tooltip>
            </TooltipTrigger>
          </div>
        </div>
        {!isCollapsed && (
          <DocumentChat
            key={currentConversationId}
            contentEditor={contentEditor}
            ref={ref}
            doc={doc}
            conversationId={currentConversationId}
          />
        )}
      </div>
    )
  },
)

EditorSidebar.displayName = "EditorSidebar"

type SidebarButtonProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tooltip: string
  onPress: () => void
  isCollapsed: boolean
}

function SidebarButton({ icon: Icon, tooltip, onPress, isCollapsed }: SidebarButtonProps) {
  return (
    <TooltipTrigger>
      <Button
        className={clsx(
          "rounded hover:bg-gray-100 text-gray-600 group flex flex-col items-center justify-center",
          isCollapsed ? "aspect-square" : "p-1",
        )}
        onPress={onPress}
      >
        <Icon className="size-3.5" />
      </Button>
      <Tooltip placement={isCollapsed ? "left" : undefined}>{tooltip}</Tooltip>
    </TooltipTrigger>
  )
}
