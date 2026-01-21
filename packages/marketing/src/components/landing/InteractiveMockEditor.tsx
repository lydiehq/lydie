import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { FileText, ChevronDown } from "lucide-react"
import styles from "./Hero.module.css"

type FeatureTab = "fields" | "collaboration" | "linking"

export function InteractiveMockEditor() {
  const [activeTab, setActiveTab] = useState<FeatureTab>("fields")
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [fieldsExpanded, setFieldsExpanded] = useState(false)
  const [showEditingCursor, setShowEditingCursor] = useState(false)

  return (
    <div className="flex flex-col items-center gap-y-4">
      {/* Tabs on the left */}
      <div className="flex gap-3 min-w-[200px]">
        <TabButton
          active={activeTab === "fields"}
          onClick={() => {
            setActiveTab("fields")
            setFieldsExpanded(true)
          }}
        >
          Custom Fields
        </TabButton>
        <TabButton
          active={activeTab === "collaboration"}
          onClick={() => {
            setActiveTab("collaboration")
            setFieldsExpanded(false)
          }}
        >
          Collaborative Editing
        </TabButton>
        <TabButton
          active={activeTab === "linking"}
          onClick={() => {
            setActiveTab("linking")
            setFieldsExpanded(false)
            setTimeout(() => setShowLinkPopover(true), 600)
          }}
        >
          Internal Linking
        </TabButton>
      </div>

      <div
        className={`relative z-10 bg-white/20 rounded-[14px] p-2 flex flex-col before:pointer-events-none before:bottom-0 before:left-0 before:right-0 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-xl after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay max-w-6xl mx-auto ${styles.heroImage}`}
        style={{
          boxShadow:
            "0 1px rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.15), 0 1px 1.5px 0 rgba(0,0,0,0.08), 0 0 1.5px 0 rgba(0,0,0,0.2), 0 0 40px rgba(255,255,255,0.09), 0 0 80px rgba(255,255,255,0.06), 0 0 120px rgba(255,255,255,0.03)",
        }}
      >
        <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10 relative">
          <div className="rounded-lg shadow-surface ring ring-black/8 relative z-10">
            <div className="h-[600px] flex flex-col bg-white rounded-md overflow-hidden shadow-surface">
              {/* Toolbar */}
              <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200 gap-0.5">
                <div className="flex items-center">
                  <div className="flex gap-1">
                    {/* Text style group */}
                    <div className="flex gap-0.5">
                      <ToolbarButton title="Bold">
                        <BoldIcon />
                      </ToolbarButton>
                      <ToolbarButton title="Italic">
                        <ItalicIcon />
                      </ToolbarButton>
                      <ToolbarButton title="Strikethrough">
                        <StrikethroughIcon />
                      </ToolbarButton>
                      <ToolbarButton title="Code">
                        <CodeIcon />
                      </ToolbarButton>
                    </div>

                    <div className="mx-1 h-6 w-px bg-gray-200"></div>

                    {/* Heading group */}
                    <div className="flex gap-1">
                      <ToolbarButton title="Heading 1">
                        <H1Icon />
                      </ToolbarButton>
                      <ToolbarButton title="Heading 2">
                        <H2Icon />
                      </ToolbarButton>
                      <ToolbarButton title="Heading 3">
                        <H3Icon />
                      </ToolbarButton>
                    </div>

                    <div className="mx-1 h-6 w-px bg-gray-200"></div>

                    {/* List group */}
                    <div className="flex gap-1">
                      <ToolbarButton title="Bullet List">
                        <BulletListIcon />
                      </ToolbarButton>
                      <ToolbarButton title="Ordered List">
                        <OrderedListIcon />
                      </ToolbarButton>
                    </div>

                    <div className="mx-1 h-6 w-px bg-gray-200"></div>

                    {/* Link */}
                    <ToolbarButton title="Add Link">
                      <LinkIcon />
                    </ToolbarButton>

                    <div className="mx-1 h-6 w-px bg-gray-200"></div>

                    {/* Image */}
                    <ToolbarButton title="Insert Image">
                      <ImageIcon />
                    </ToolbarButton>

                    <div className="mx-1 h-6 w-px bg-gray-200"></div>

                    {/* Table */}
                    <ToolbarButton title="Insert Table">
                      <TableIcon />
                    </ToolbarButton>
                  </div>
                </div>

                <div className="flex gap-x-1 items-center">
                  <button className="p-1.5 rounded hover:bg-gray-100" aria-label="More options">
                    <svg
                      className="size-3.5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="5" r="1.5" fill="currentColor"></circle>
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
                      <circle cx="12" cy="19" r="1.5" fill="currentColor"></circle>
                    </svg>
                  </button>
                  <button className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                    Publish
                  </button>
                  <div className="mx-1 h-6 w-px bg-gray-200"></div>
                </div>
              </div>

              {/* Editor Content */}
              <div className="flex grow overflow-hidden relative">
                {/* Main Editor Area */}
                <div className="flex-1 flex flex-col">
                  <div className="flex py-4 overflow-y-auto grow flex-col px-3">
                    <div className="mx-auto w-full h-full max-w-[65ch] flex flex-col relative">
                      {/* Custom Fields Section - Always visible */}
                      <div className="mb-4">
                        <CustomFieldsSection
                          expanded={activeTab === "fields" && fieldsExpanded}
                          onToggle={() => {
                            if (activeTab === "fields") {
                              setFieldsExpanded(!fieldsExpanded)
                            } else {
                              setActiveTab("fields")
                              setFieldsExpanded(true)
                            }
                          }}
                          isActive={activeTab === "fields"}
                        />
                      </div>

                      {/* Title */}
                      <div className="mb-4">
                        <h1 className="text-3xl font-bold text-gray-900 outline-none relative">
                          Product Roadmap Q1 2026
                          {/* Collaborative Cursors */}
                          <AnimatePresence>
                            {activeTab === "collaboration" && (
                              <>
                                <CollaboratorCursor
                                  name="Sarah"
                                  color="#3b82f6"
                                  position={{
                                    top: "0.5rem",
                                    left: "12rem",
                                  }}
                                />
                                <CollaboratorCursor
                                  name="Alex"
                                  color="#10b981"
                                  position={{
                                    top: "0.5rem",
                                    left: "20rem",
                                  }}
                                />
                              </>
                            )}
                          </AnimatePresence>
                        </h1>
                      </div>

                      {/* Content */}
                      <div className="prose prose-sm max-w-none text-gray-700 space-y-3 relative">
                        <h2 className="text-xl font-semibold text-gray-900 mt-4 mb-2">Overview</h2>
                        <p className="leading-relaxed relative">
                          This quarter we're focusing on enhancing our core platform capabilities and
                          expanding integration support. Our key priorities include{" "}
                          <CollaborativeTextEdit
                            originalText="performance improvements, advanced collaboration features"
                            newText="advanced collaboration features, performance improvements"
                            isActive={activeTab === "collaboration"}
                            onCursorShow={(show) => setShowEditingCursor(show)}
                          />{" "}
                          and a revamped user experience.
                          {/* Editing Cursor */}
                          <AnimatePresence>
                            {activeTab === "collaboration" && showEditingCursor && (
                              <CollaboratorCursor
                                name="Sarah"
                                color="#3b82f6"
                                position={{
                                  top: "0.25rem",
                                  left: "12rem",
                                }}
                              />
                            )}
                          </AnimatePresence>
                        </p>

                        <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-1.5 relative">
                          Key Features
                          {/* Link Popover - Animated */}
                          <AnimatePresence>
                            {activeTab === "linking" && showLinkPopover && (
                              <LinkPopoverMock onClose={() => setShowLinkPopover(false)} />
                            )}
                          </AnimatePresence>
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar */}
                  <div className="px-4 py-2 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <span>Last saved 2 minutes ago</span>
                      {/* Collaboration Indicators */}
                      {activeTab === "collaboration" && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 }}
                          className="flex items-center gap-1 ml-2"
                        >
                          <CollaboratorAvatar name="Sarah" color="#3b82f6" />
                          <CollaboratorAvatar name="Alex" color="#10b981" />
                          <span className="text-xs text-gray-600 ml-1">2 people editing</span>
                        </motion.div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>1,247 words</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-2 py-1.5 rounded-full hover:bg-black/5 transition-colors duration-75 text-sm font-medium ${
        active ? "text-gray-900 bg-gray-100" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  )
}

// Custom Fields Section Component
function CustomFieldsSection({
  expanded,
  onToggle,
  isActive,
}: {
  expanded: boolean
  onToggle: () => void
  isActive: boolean
}) {
  return (
    <div className="flex flex-col gap-y-2 w-full border-b border-gray-200 pb-4">
      <button
        onClick={onToggle}
        className="flex justify-between items-center w-full border-b border-gray-200 pb-2 hover:bg-gray-50 -mx-3 px-3 py-2 rounded-t transition-colors"
      >
        <div className="flex gap-x-4">
          <div
            className={`text-sm px-2 py-1 ${
              isActive ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-500"
            }`}
          >
            Fields
          </div>
          <div className="text-gray-500 text-sm px-2 py-1">
            <span>Documents</span>
            <span className="text-xs text-gray-400 ml-1">3</span>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="size-4 text-gray-500" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-2">
              <CustomField label="Status" value="In Progress" />
              <CustomField label="Priority" value="High" />
              <CustomField label="Owner" value="Engineering Team" />
              <CustomField label="Target Date" value="March 31, 2026" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Custom Field Component
function CustomField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="text-sm text-gray-900 px-3 py-1.5 border border-gray-200 rounded-md bg-gray-50">
        {value}
      </div>
    </div>
  )
}

// Collaborator Cursor Component
function CollaboratorCursor({
  name,
  color,
  position,
}: {
  name: string
  color: string
  position: { top: string; left: string }
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ delay: 0.2 }}
      className="absolute pointer-events-none"
      style={position}
    >
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ color }}
      >
        <path d="M0 0L0 16L4.5 11.5L7 19L9.5 18L7 10.5L12 10.5L0 0Z" fill="currentColor" />
      </svg>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="absolute top-5 left-4 px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap shadow-sm"
        style={{ backgroundColor: color }}
      >
        {name}
      </motion.div>
    </motion.div>
  )
}

// Collaborator Avatar Component
function CollaboratorAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="size-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
      style={{ backgroundColor: color }}
      title={name}
    >
      {name[0]}
    </div>
  )
}

// Link Popover Mock Component
function LinkPopoverMock({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="absolute top-full left-0 mt-2 z-50 bg-white ring ring-black/10 rounded-lg shadow-lg p-2 flex flex-col w-[280px]"
    >
      <div className="flex gap-x-1 items-center">
        <div className="flex gap-x-2 overflow-hidden text-ellipsis whitespace-nowrap px-1 items-center">
          <FileText className="size-3.5 text-gray-500 shrink-0" />
          <div className="text-xs text-gray-700 truncate">API Documentation</div>
        </div>
        <div className="h-4 w-px bg-gray-200 mx-1"></div>
        <div className="flex gap-x-0.5">
          <PopoverButton title="Open document">
            <FileText className="size-3.5 text-gray-700" />
          </PopoverButton>
          <PopoverButton title="Edit link">
            <EditIcon className="size-3.5 text-gray-700" />
          </PopoverButton>
          <PopoverButton title="Remove link">
            <UnlinkIcon className="size-3.5 text-gray-700" />
          </PopoverButton>
        </div>
      </div>
    </motion.div>
  )
}

// Popover Button Component
function PopoverButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button className="p-1 rounded hover:bg-gray-100" title={title} onClick={(e) => e.preventDefault()}>
      {children}
    </button>
  )
}

// Toolbar Button Component
function ToolbarButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button className="p-1 rounded hover:bg-gray-100 text-gray-700" title={title}>
      {children}
    </button>
  )
}

// Icon Components
function BoldIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
      ></path>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
      ></path>
    </svg>
  )
}

function ItalicIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="19" y1="4" x2="10" y2="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></line>
      <line
        x1="14"
        y1="20"
        x2="5"
        y2="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></line>
      <line x1="15" y1="4" x2="9" y2="20" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></line>
    </svg>
  )
}

function StrikethroughIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h16M6 6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v1M6 18c0 1.1.9 2 2 2h8c1.1 0 2 .9 2 2v-1"
      ></path>
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polyline
        points="16 18 22 12 16 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
      <polyline
        points="8 6 2 12 8 18"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
    </svg>
  )
}

function H1Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m5-12v12m0-6h3"
      ></path>
    </svg>
  )
}

function H2Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m5 4h5l-5-6h5"
      ></path>
    </svg>
  )
}

function H3Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m6 0h4a2 2 0 0 0 0-4h-4m0 4h4a2 2 0 0 0 0-4"
      ></path>
    </svg>
  )
}

function BulletListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <circle cx="3.5" cy="6" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="12" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="18" r="1" fill="currentColor"></circle>
    </svg>
  )
}

function OrderedListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="10" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <path
        d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></path>
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      ></path>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      ></path>
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
      <polyline
        points="21 15 16 10 5 21"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
    </svg>
  )
}

function TableIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9" strokeWidth="2"></line>
      <line x1="3" y1="15" x2="21" y2="15" strokeWidth="2"></line>
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth="2"></line>
    </svg>
  )
}

// Collaborative Text Edit Component
function CollaborativeTextEdit({
  originalText,
  newText,
  isActive,
  onCursorShow,
}: {
  originalText: string
  newText: string
  isActive: boolean
  onCursorShow: (show: boolean) => void
}) {
  const [showSelection, setShowSelection] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [displayedText, setDisplayedText] = useState(originalText)
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (!isActive) {
      // Reset when tab is not active
      setShowSelection(false)
      setIsTyping(false)
      setDisplayedText(originalText)
      setHasStarted(false)
      onCursorShow(false)
      return
    }

    // Start the animation sequence after a delay
    const timer = setTimeout(() => {
      setHasStarted(true)
      setShowSelection(true)
      onCursorShow(true) // Show cursor when selection starts

      // After selection is shown, start typing
      const typingTimer = setTimeout(() => {
        setShowSelection(false)
        setIsTyping(true)

        // Type out the new text character by character
        let currentIndex = 0
        const typingInterval = setInterval(() => {
          if (currentIndex < newText.length) {
            setDisplayedText(newText.slice(0, currentIndex + 1))
            currentIndex++
          } else {
            clearInterval(typingInterval)
            setIsTyping(false)
            // Keep cursor visible for a moment after typing completes
            setTimeout(() => {
              onCursorShow(false)
            }, 500)
          }
        }, 50) // Typing speed: 50ms per character (faster for longer text)

        return () => clearInterval(typingInterval)
      }, 1200) // Show selection for 1.2 seconds

      return () => clearTimeout(typingTimer)
    }, 800) // Initial delay before starting

    return () => clearTimeout(timer)
  }, [isActive, originalText, newText, onCursorShow])

  return (
    <span className="relative inline-block">
      {!hasStarted ? (
        <span>{originalText}</span>
      ) : (
        <>
          {showSelection && (
            <motion.span
              initial={{ backgroundColor: "transparent" }}
              animate={{ backgroundColor: "#bfdbfe" }} // blue-200
              exit={{ backgroundColor: "transparent" }}
              transition={{ duration: 0.3 }}
              className="rounded px-0.5"
            >
              {originalText}
            </motion.span>
          )}
          {isTyping && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-blue-600">
              {displayedText}
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="inline-block w-0.5 h-4 bg-blue-600 ml-0.5 align-middle"
              />
            </motion.span>
          )}
          {!showSelection && !isTyping && hasStarted && <span className="text-blue-600">{newText}</span>}
        </>
      )}
    </span>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  )
}

function UnlinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  )
}
