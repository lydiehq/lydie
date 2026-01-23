import type { Editor as TiptapEditor } from "@tiptap/core"
import type { ReactNode } from "react"

export type DocumentTreeItem = {
  id: string
  name: string
  type: "document" | "integration-link" | "integration-group"
  children?: DocumentTreeItem[]
  integrationLinkId?: string | null
  integrationType?: string
  syncStatus?: string | null
  isLocked?: boolean
}

export type SidebarLinkItem = {
  id: string
  name: string
  icon?: ReactNode
  href?: string
  onClick?: () => void
  isActive?: boolean
  isExact?: boolean
}

export type EditorDocument = {
  id: string
  title: string
  content?: any
  coverImage?: string | null
  customFields?: Record<string, string | number>
  isLocked?: boolean
  updatedAt?: Date
}
