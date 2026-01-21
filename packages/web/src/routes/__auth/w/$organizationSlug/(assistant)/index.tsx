import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { Button } from "@/components/generic/Button"
import { PuzzleIcon, DocumentIcon, UploadIcon, UsersIcon } from "@/icons"
import { useAuth } from "@/context/auth.context"
import { useAssistant } from "@/context/assistant.context"
import { useCallback } from "react"
import { AssistantInput } from "@/components/assistant/AssistantInput"

export const Route = createFileRoute("/__auth/w/$organizationSlug/(assistant)/")({
  component: PageComponent,
  ssr: false,
})

function PageComponent() {
  const onboardingSections = [
    {
      id: "integrations",
      icon: PuzzleIcon,
      title: "Connect integrations",
      tasks: [
        {
          id: "connect-first",
          title: "Connect your first integration",
          description: "Connect your favorite tools to Lydie to get started.",
          action: "Connect",
        },
        {
          id: "configure-sync",
          title: "Configure sync settings",
          description: "Set up how your integrations sync with Lydie.",
          action: "Configure",
        },
      ],
    },
    {
      id: "documents",
      icon: DocumentIcon,
      title: "Create your first document",
      tasks: [
        {
          id: "create-document",
          title: "Create a new document",
          description: "Start by creating a document to organize your knowledge.",
          action: "Create",
        },
        {
          id: "organize-content",
          title: "Organize your content",
          description: "Structure your documents with folders and collections.",
          action: "Organize",
        },
      ],
    },
    {
      id: "import",
      icon: UploadIcon,
      title: "Import content",
      tasks: [
        {
          id: "import-files",
          title: "Import existing files",
          description: "Import existing content from various sources.",
          action: "Import",
        },
        {
          id: "sync-integrations",
          title: "Sync from integrations",
          description: "Pull content from your connected integrations.",
          action: "Sync",
        },
      ],
    },
    {
      id: "team",
      icon: UsersIcon,
      title: "Invite team members",
      tasks: [
        {
          id: "invite-members",
          title: "Invite your first member",
          description: "Collaborate with your team by inviting members.",
          action: "Invite",
        },
        {
          id: "set-permissions",
          title: "Set member permissions",
          description: "Configure access levels for your team members.",
          action: "Configure",
        },
      ],
    },
  ]

  const { user } = useAuth()
  const { sendMessage, stop, conversationId } = useAssistant()
  const navigate = useNavigate()

  const handleSubmit = useCallback(
    (text: string) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
        },
      })

      navigate({
        to: "/w/$organizationSlug/assistant",
        from: "/w/$organizationSlug",
        search: {
          conversationId,
        },
      })
    },
    [sendMessage, navigate, conversationId],
  )

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <div className="mt-[34svh] max-w-xl mx-auto flex flex-col gap-y-4 items-center w-full">
          <div className="flex flex-col gap-y-4 items-center w-full">
            <h1 className="text-2xl font-medium text-gray-900">Ask anything about your documents</h1>
            <AssistantInput
              onSubmit={handleSubmit}
              onStop={stop}
              placeholder="Ask anything. Use @ to refer to documents"
            />
          </div>
        </div>
      </Surface>
    </div>
  )

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full">
        <div className="py-8 max-w-3xl mx-auto flex flex-col gap-y-8 w-full px-8 pb-16">
          <div className="flex flex-col gap-y-2">
            <h1 className="text-2xl font-medium text-gray-900">
              Welcome to Lydie, {user.name?.split(" ")[0]}!
            </h1>
            <p className="text-gray-500 text-sm">
              We&apos;ve suggested some tasks here to help you get started.
            </p>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

            {/* Sections */}
            <div className="flex flex-col gap-y-12">
              {onboardingSections.map((section) => (
                <OnboardingSection key={section.id} section={section} />
              ))}
            </div>
          </div>
        </div>
      </Surface>
    </div>
  )
}

interface OnboardingSectionProps {
  section: {
    id: string
    icon: React.ComponentType<{ className?: string }>
    title: string
    tasks: Array<{
      id: string
      title: string
      description: string
      action: string
    }>
  }
}

function OnboardingSection({ section }: OnboardingSectionProps) {
  const Icon = section.icon

  return (
    <div className="relative">
      {/* Icon on timeline */}
      <div className="absolute left-0 top-0 w-12 h-12 flex items-center justify-center">
        <div className="relative z-10 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ring-4 ring-white">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
      </div>

      {/* Content */}
      <div className="ml-16 flex flex-col gap-y-4">
        <h2 className="text-lg font-medium text-gray-900">{section.title}</h2>

        {/* Task cards */}
        <div className="flex flex-col gap-y-3">
          {section.tasks.map((task) => (
            <div key={task.id} className="relative">
              {/* Connecting line from timeline to task */}
              <div className="absolute -left-8 top-6 w-8 h-0.5 bg-gray-200" />

              {/* Task card */}
              <div className="flex items-start gap-x-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                <div className="mt-0.5">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                </div>
                <div className="flex-1 flex flex-col gap-y-1">
                  <h3 className="font-medium text-gray-900 text-sm">{task.title}</h3>
                  <p className="text-gray-500 text-sm">{task.description}</p>
                </div>
                <Button onPress={() => null} size="xs" intent="ghost">
                  {task.action}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
