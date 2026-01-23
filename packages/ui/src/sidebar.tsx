import type { ReactNode } from "react"
import { sidebarItemStyles } from "./styles"
import type { SidebarLinkItem } from "./types"

export type SidebarProps = {
  isCollapsed: boolean
  onToggle: () => void
  organizationMenu?: ReactNode
  sidebarIcon?: ReactNode
  collapsedIcon?: ReactNode
  quickActionButton?: ReactNode
  searchButton?: ReactNode
  navigationLinks?: SidebarLinkItem[]
  renderNavigationLink?: (item: SidebarLinkItem, children: ReactNode) => ReactNode
  documentSection?: ReactNode
  bottomSection?: ReactNode
  className?: string
}

export function Sidebar({
  isCollapsed,
  onToggle,
  organizationMenu,
  sidebarIcon,
  collapsedIcon,
  quickActionButton,
  searchButton,
  navigationLinks = [],
  renderNavigationLink = (item, children) => children,
  documentSection,
  bottomSection,
  className = "",
}: SidebarProps) {
  return (
    <div className={`flex flex-col grow max-h-screen overflow-hidden ${className}`}>
      {/* Header with org menu and collapse button */}
      <div className="flex justify-between items-center p-3">
        {organizationMenu}
        {!isCollapsed && (
          <button
            onClick={onToggle}
            className="group p-1 -m-1 rounded hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Collapse sidebar"
          >
            {sidebarIcon}
          </button>
        )}
      </div>

      {/* Collapsed state */}
      {isCollapsed && (
        <div className="h-full justify-between items-center flex flex-col p-3">
          <div></div>
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-black/5 text-gray-700 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Expand sidebar"
          >
            {collapsedIcon}
          </button>
        </div>
      )}

      {/* Expanded state */}
      {!isCollapsed && (
        <div className="flex flex-col gap-y-4 pb-2 grow min-h-0">
          {/* Quick action and search buttons */}
          {(quickActionButton || searchButton) && (
            <div className="flex gap-x-1 px-3">
              {quickActionButton}
              {searchButton}
            </div>
          )}

          {/* Navigation links */}
          {navigationLinks.length > 0 && (
            <div className="flex flex-col px-2">
              {navigationLinks.map((item) => {
                const content = (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {item.icon}
                    <span className="truncate flex-1">{item.name}</span>
                  </div>
                )

                return renderNavigationLink(
                  item,
                  <div
                    key={item.id}
                    className={sidebarItemStyles({
                      isCurrent: item.isActive,
                      className: "px-1.5 cursor-pointer",
                    })}
                  >
                    {content}
                  </div>,
                )
              })}
            </div>
          )}

          {/* Document section */}
          {documentSection}

          {/* Bottom section */}
          {bottomSection}
        </div>
      )}
    </div>
  )
}
