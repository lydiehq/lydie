import { motion, AnimatePresence } from "motion/react"
import { useCallback, useState, useMemo, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { EditorContent } from "@tiptap/react"
import {
  Form,
  Button as RACButton,
  Button,
  useFilter,
  Autocomplete,
  ListBox,
  SelectValue,
  Select as AriaSelect,
} from "react-aria-components"
import {
  CircleArrowUpIcon,
  SquareIcon,
  AsteriskIcon,
  MinusIcon,
  ArrowShrinkIcon,
  ArrowExpandIcon,
  DocumentIcon,
  DocumentsIcon,
  CreateIcon,
  HelpCircleIcon,
  ChevronDownIcon,
  MessageCircleIcon,
} from "@/icons"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { ChatAlert } from "@/components/editor/ChatAlert"
import { useFloatingAssistant } from "@/context/floating-assistant.context"
import { useOrganization } from "@/context/organization.context"
import { useChatComposer } from "@/components/chat/useChatComposer"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { getReferenceDocumentIds } from "@/utils/parse-references"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { createId } from "@lydie/core/id"
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler"
import type { ChatAlertState } from "@/components/editor/ChatAlert"
import { trackEvent } from "@/lib/posthog"
import { formatDistanceToNow } from "date-fns"
import { SelectItem, SelectSection } from "@/components/generic/Select"
import { SearchField } from "@/components/generic/SearchField"
import { Popover } from "@/components/generic/Popover"
import { useNavigate } from "@tanstack/react-router"

const FLOATING_ASSISTANT_CONVERSATION_KEY = "floating-assistant-conversation-id"

export function FloatingAssistant({ currentDocumentId }: { currentDocumentId: string | null }) {
  const { isOpen, close, toggle, isDocked, dock, undock, initialPrompt, clearPrompt } = useFloatingAssistant()
  const { organization } = useOrganization()

  // Load conversationId from localStorage or create new one
  const [conversationId, setConversationId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(FLOATING_ASSISTANT_CONVERSATION_KEY)
      if (saved) {
        return saved
      }
    }
    return createId()
  })

  const [alert, setAlert] = useState<ChatAlertState | null>(null)
  const messageStartTimeRef = useRef<number>(0)

  // Fetch current conversation to load messages
  const [currentConversation] = useQuery(
    conversationId
      ? queries.assistant.byId({
        organizationId: organization.id,
        conversationId,
      })
      : null,
  )

  const {
    messages,
    sendMessage: originalSendMessage,
    stop,
    status,
    setMessages,
  } = useChat<DocumentChatAgentUIMessage>({
    id: conversationId,
    messages:
      currentConversation?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
    transport: new DefaultChatTransport({
      api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
      credentials: "include",
      body: {
        conversationId,
      },
      headers: {
        "X-Organization-Id": organization.id,
      },
    }),
    onError: (error) => {
      console.error("Assistant chat error:", error)
      const { message } = parseChatError(error)

      if (isUsageLimitError(error)) {
        setAlert({
          show: true,
          type: "error",
          title: "Daily Limit Reached",
          message,
        })
      } else {
        setAlert({
          show: true,
          type: "error",
          title: "Something went wrong",
          message,
        })
      }
    },
    onFinish: () => {
      const responseTime = messageStartTimeRef.current ? Date.now() - messageStartTimeRef.current : undefined

      trackEvent("assistant_response_received", {
        conversationId,
        organizationId: organization.id,
        responseTimeMs: responseTime,
      })
    },
  })

  // Update messages when conversation changes
  useEffect(() => {
    if (currentConversation?.messages) {
      setMessages(
        currentConversation.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })),
      )
    } else if (currentConversation === null && conversationId) {
      // Conversation doesn't exist yet (new chat), clear messages
      setMessages([])
    }
  }, [currentConversation?.id, conversationId, setMessages])

  // Persist conversationId to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FLOATING_ASSISTANT_CONVERSATION_KEY, conversationId)
    }
  }, [conversationId])

  const handleNewChat = useCallback(() => {
    const newId = createId()
    setConversationId(newId)
    setMessages([])
  }, [setMessages])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id)
    },
    [],
  )

  const sendMessage = useCallback(
    (options: { text: string; metadata?: any }) => {
      messageStartTimeRef.current = Date.now()

      trackEvent("assistant_message_sent", {
        conversationId,
        organizationId: organization.id,
        messageLength: options.text.length,
      })

      return originalSendMessage(options)
    },
    [originalSendMessage, conversationId, organization.id],
  )

  const floatingContainer = typeof document !== "undefined" ? document.getElementById("floating-assistant-container") : null
  const dockedContainer = typeof document !== "undefined" ? document.getElementById("docked-assistant-container") : null

  if (!isDocked && !isOpen) {
    return (
      <motion.div
        layoutId="assistant"
        className="fixed right-4 bottom-4 z-30"
        initial={false}
        transition={{ type: "spring", stiffness: 450, damping: 35 }}
      >
        <RACButton
          onPress={toggle}
          aria-label="Open AI Assistant"
          className="bg-white shadow-surface rounded-full size-10 justify-center items-center flex hover:bg-gray-50 transition-colors"
        >
          <AsteriskIcon className="size-4 text-gray-600" aria-hidden="true" />
        </RACButton>
      </motion.div>
    )
  }

  const shouldShow = isDocked || isOpen
  if (!shouldShow) return null

  const targetContainer = isDocked ? dockedContainer : floatingContainer
  if (!targetContainer) return null

  const content = (
    <motion.div
      layoutId="assistant"
      initial={false}
      transition={{ type: "spring", stiffness: 400, damping: 35, mass: 1 }}
      role="region"
      aria-label="AI Assistant"
      aria-labelledby="assistant-title"
      className={
        isDocked
          ? "w-full h-full bg-white flex flex-col overflow-hidden"
          : "fixed right-4 bottom-4 w-[400px] h-[540px] bg-white rounded-xl ring ring-black/8 shadow-lg flex flex-col overflow-hidden z-30"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <ConversationDropdown
          conversationId={conversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
        />
        <div className="flex items-center gap-1">
          <Button
            onPress={isDocked ? undock : dock}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors"
            aria-label={isDocked ? "Undock assistant" : "Dock assistant"}
          >
            {isDocked ? (
              <ArrowShrinkIcon className="size-4 text-gray-600" aria-hidden="true" />
            ) : (
              <ArrowExpandIcon className="size-4 text-gray-600" aria-hidden="true" />
            )}
          </Button>
          {!isDocked && (
            <Button
              onPress={close}
              aria-label="Close assistant"
              className="p-1 hover:bg-gray-200 rounded-md transition-colors"
            >
              <MinusIcon className="size-4 text-gray-600" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FloatingAssistantChatContent
          organizationId={organization.id}
          currentDocumentId={currentDocumentId}
          initialPrompt={initialPrompt}
          onPromptUsed={clearPrompt}
          messages={messages}
          sendMessage={sendMessage}
          stop={stop}
          status={status}
          alert={alert}
          setAlert={setAlert}
        />
      </div>
    </motion.div>
  )

  return createPortal(content, targetContainer)
}

type ConversationGroup = {
  title: string
  conversations: any[]
}

const MAX_CONVERSATIONS_TO_SHOW = 15

function ConversationDropdown({
  conversationId,
  onNewChat,
  onSelectConversation,
}: {
  conversationId: string
  onNewChat: () => void
  onSelectConversation: (id: string) => void
}) {
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const { contains } = useFilter({ sensitivity: "base" })
  const [conversations] = useQuery(
    queries.assistant.conversationsByUser({
      organizationSlug: organization.slug,
    }),
  )

  const currentConversation = useMemo(() => {
    return conversations?.find((c) => c.id === conversationId)
  }, [conversations, conversationId])

  const displayTitle = useMemo(() => {
    if (currentConversation) {
      return currentConversation.title || "New conversation"
    }
    return "New Chat"
  }, [currentConversation])

  // Use the conversation title directly (generated by the backend)
  const getConversationTitle = useCallback((conversation: any) => {
    return conversation.title || "New conversation"
  }, [])

  const groupConversations = useCallback((convs: typeof conversations) => {
    if (!convs || convs.length === 0) return []

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const groups: ConversationGroup[] = [
      { title: "Today", conversations: [] },
      { title: "Yesterday", conversations: [] },
      { title: "Previous 7 days", conversations: [] },
      { title: "Previous 30 days", conversations: [] },
      { title: "Older", conversations: [] },
    ]

    for (const conversation of convs) {
      // Timestamp is already in milliseconds
      const updatedAt = new Date(conversation.updated_at)
      if (updatedAt >= today) {
        groups[0].conversations.push(conversation)
      } else if (updatedAt >= yesterday) {
        groups[1].conversations.push(conversation)
      } else if (updatedAt >= sevenDaysAgo) {
        groups[2].conversations.push(conversation)
      } else if (updatedAt >= thirtyDaysAgo) {
        groups[3].conversations.push(conversation)
      } else {
        groups[4].conversations.push(conversation)
      }
    }

    // Filter out empty groups
    return groups.filter((group) => group.conversations.length > 0)
  }, [])

  // Limit conversations to most recent ones
  const limitedConversations = useMemo(() => {
    if (!conversations) return []
    // Conversations are already sorted by updated_at desc from the query
    return conversations.slice(0, MAX_CONVERSATIONS_TO_SHOW)
  }, [conversations])

  const hasMoreConversations = useMemo(() => {
    return (conversations?.length || 0) > MAX_CONVERSATIONS_TO_SHOW
  }, [conversations])

  const groupedConversations = useMemo(() => {
    return groupConversations(limitedConversations)
  }, [limitedConversations, groupConversations])

  const handleSeeAllConversations = useCallback(() => {
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug: organization.slug },
    })
  }, [navigate, organization.slug])

  return (
    <AriaSelect
      value={conversationId || null}
      onChange={(key) => {
        if (key === "new") {
          onNewChat()
        } else if (key && typeof key === "string") {
          onSelectConversation(key)
        }
      }}
      className="group flex flex-col gap-1 min-w-[200px]"
    >
      <Button className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 border-0 bg-transparent shadow-none min-w-0">
        <MessageCircleIcon className="size-4 text-gray-600 shrink-0" aria-hidden="true" />
        <SelectValue className="max-w-[200px] truncate text-sm">
          {({ selectedText }) => selectedText || displayTitle}
        </SelectValue>
        <ChevronDownIcon className="size-3.5 text-gray-500 shrink-0" aria-hidden="true" />
      </Button>
      <Popover className="min-w-[300px] max-h-[500px] flex flex-col p-0" placement="bottom start">
        <Autocomplete filter={contains}>
          <div className="p-2 border-b border-gray-200">
            <SearchField
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full"
            />
          </div>
          <ListBox
            items={groupedConversations}
            className="outline-none max-h-[400px] overflow-auto"
            selectionMode="single"
          >
            {(group: ConversationGroup) => (
              <SelectSection key={group.title} id={group.title} title={group.title} items={group.conversations}>
                {(conversation: any) => {
                  if (!conversation?.id) {
                    return <SelectItem id={`empty-${Math.random()}`} textValue="" />
                  }
                  const title = getConversationTitle(conversation)
                  const isSelected = conversation.id === conversationId

                  return (
                    <SelectItem
                      id={conversation.id}
                      textValue={title}
                      className={isSelected ? "bg-blue-50" : ""}
                    >
                      <div className="flex flex-col items-start gap-1 w-full">
                        <div className="flex items-center gap-2 w-full">
                          <MessageCircleIcon
                            className={`size-4 shrink-0 ${isSelected ? "text-blue-600" : "text-gray-400"}`}
                            aria-hidden="true"
                          />
                          <span className={`text-sm flex-1 truncate ${isSelected ? "font-semibold" : ""}`}>
                            {title.length > 40 ? title.substring(0, 40) + "..." : title}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 ml-6">
                          {formatDistanceToNow(new Date(conversation.updated_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </SelectItem>
                  )
                }}
              </SelectSection>
            )}
          </ListBox>
        </Autocomplete>
        <div className="border-t border-gray-200 p-1 flex flex-col gap-1">
          <RACButton
            onPress={onNewChat}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <CreateIcon className="size-4 text-gray-500" aria-hidden="true" />
            <span>New Chat</span>
          </RACButton>
          {hasMoreConversations && (
            <RACButton
              onPress={handleSeeAllConversations}
              className="flex items-center justify-center w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span>See all conversations</span>
            </RACButton>
          )}
        </div>
      </Popover>
    </AriaSelect>
  )
}

function FloatingAssistantChatContent({
  organizationId,
  currentDocumentId,
  initialPrompt,
  onPromptUsed,
  messages,
  sendMessage,
  stop,
  status,
  alert,
  setAlert,
}: {
  organizationId: string
  currentDocumentId: string | null
  initialPrompt?: string
  onPromptUsed?: () => void
  messages: any[]
  sendMessage: (options: { text: string; metadata?: any }) => void
  stop: () => void
  status: string
  alert: ChatAlertState | null
  setAlert: (alert: ChatAlertState | null) => void
}) {
  const { organization } = useOrganization()
  const [hasUsedInitialPrompt, setHasUsedInitialPrompt] = useState(false)
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])
  const [isCurrentDocumentDismissed, setIsCurrentDocumentDismissed] = useState(false)

  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }))
  const [currentDocument] = useQuery(
    currentDocumentId
      ? queries.documents.byId({
        organizationId: organization.id,
        documentId: currentDocumentId,
      })
      : null,
  )

  const availableDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents],
  )

  const documentTitleById = useMemo(() => {
    return new Map(availableDocuments.map((doc) => [doc.id, doc.title || "Untitled document"]))
  }, [availableDocuments])

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmit()
      }
    },
    onChange: (editor) => {
      const textContent = editor.getText()
      setMentionedDocumentIds(getReferenceDocumentIds(textContent))
    },
    placeholder: "Ask anything. Use @ to refer to documents",
    autoFocus: true,
    initialContent: initialPrompt && !hasUsedInitialPrompt ? initialPrompt : "",
  })

  const contextItems = useMemo(() => {
    const items: ChatContextItem[] = []

    if (currentDocument && !isCurrentDocumentDismissed) {
      items.push({
        id: currentDocument.id,
        type: "document",
        label: currentDocument.title || "Untitled document",
        source: "current",
        removable: true,
      })
    }

    for (const documentId of mentionedDocumentIds) {
      if (documentId === currentDocument?.id) continue
      items.push({
        id: documentId,
        type: "document",
        label: documentTitleById.get(documentId) || "Untitled document",
        source: "mention",
      })
    }

    return items
  }, [currentDocument, documentTitleById, isCurrentDocumentDismissed, mentionedDocumentIds])

  const contextDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    if (currentDocument && !isCurrentDocumentDismissed) {
      ids.add(currentDocument.id)
    }
    for (const id of mentionedDocumentIds) {
      ids.add(id)
    }
    return Array.from(ids)
  }, [currentDocument, isCurrentDocumentDismissed, mentionedDocumentIds])

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      const textContent = chatEditor.getTextContent()
      if (!textContent.trim()) return

      sendMessage({
        text: textContent,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds,
          currentDocument:
            currentDocument && currentDocumentId
              ? {
                id: currentDocumentId,
                wordCount: 0,
              }
              : undefined,
        },
      })

      chatEditor.clearContent()
      setIsCurrentDocumentDismissed(false)

      // Clear the initial prompt after first submission
      if (initialPrompt && !hasUsedInitialPrompt) {
        setHasUsedInitialPrompt(true)
        onPromptUsed?.()
      }
    },
    [
      sendMessage,
      chatEditor,
      initialPrompt,
      hasUsedInitialPrompt,
      onPromptUsed,
      contextDocumentIds,
      currentDocument,
      currentDocumentId,
    ],
  )

  const canStop = status === "submitted" || status === "streaming"

  const suggestions = useMemo(
    () => {
      if (currentDocumentId) {
        // Document page suggestions
        return [
          {
            text: "Summarize this document",
            icon: DocumentIcon,
          },
          {
            text: "Help me write a draft",
            icon: CreateIcon,
          },
          {
            text: "Explain this in simpler terms",
            icon: HelpCircleIcon,
          },
        ]
      } else {
        // Home page suggestions
        return [
          {
            text: "Summarize my 3 last documents",
            icon: DocumentsIcon,
          },
          {
            text: "Help me write a draft",
            icon: CreateIcon,
          },
          {
            text: "What can you help me with?",
            icon: HelpCircleIcon,
          },
        ]
      }
    },
    [currentDocumentId],
  )

  const handleSuggestionClick = useCallback(
    (suggestionText: string) => {
      sendMessage({
        text: suggestionText,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds,
          currentDocument:
            currentDocument && currentDocumentId
              ? {
                id: currentDocumentId,
                wordCount: 0,
              }
              : undefined,
        },
      })

      chatEditor.clearContent()
      setIsCurrentDocumentDismissed(false)

      // Clear the initial prompt after first submission
      if (initialPrompt && !hasUsedInitialPrompt) {
        setHasUsedInitialPrompt(true)
        onPromptUsed?.()
      }
    },
    [
      sendMessage,
      chatEditor,
      initialPrompt,
      hasUsedInitialPrompt,
      onPromptUsed,
      contextDocumentIds,
      currentDocument,
      currentDocumentId,
    ],
  )

  const isChatEmpty = messages.length === 0

  return (
    <div className="flex flex-col overflow-hidden grow h-full">
      <ChatMessages
        messages={messages}
        status={status as "submitted" | "streaming" | "ready" | "error"}
        editor={null}
        organizationId={organizationId}
      />
      <div className="p-1.5 relative">
        {isChatEmpty && (
          <div className="flex flex-col gap-y-1">
            {suggestions.map((suggestion) => {
              const Icon = suggestion.icon
              return (
                <RACButton
                  key={suggestion.text}
                  onPress={() => handleSuggestionClick(suggestion.text)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Icon className="size-3.5 text-gray-500" aria-hidden="true" />
                  <span>{suggestion.text}</span>
                </RACButton>
              )
            })}
          </div>
        )}
        <div className="rounded-lg p-2 flex flex-col gap-y-2 z-10 relative bg-gray-100 ring ring-black/8">
          <AnimatePresence mode="sync">
            {alert && (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <ChatAlert alert={alert} onDismiss={() => setAlert(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col">
            <Form className="relative flex flex-col" onSubmit={handleSubmit}>
              <ChatContextList
                items={contextItems}
                onRemove={(item) => {
                  if (item.source === "current") {
                    setIsCurrentDocumentDismissed(true)
                  }
                }}
              />
              <EditorContent editor={chatEditor.editor} />
              <RACButton
                type={canStop ? "button" : "submit"}
                onPress={canStop ? stop : undefined}
                className="p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"
                isDisabled={false}
              >
                {canStop ? (
                  <SquareIcon className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <CircleArrowUpIcon className="size-4.5 text-gray-500" />
                )}
              </RACButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}
