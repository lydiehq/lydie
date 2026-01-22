import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { Button } from "@/components/generic/Button"
import { Separator } from "@/components/generic/Separator"
import { CircularProgress } from "@/components/generic/CircularProgress"
import { useOnboardingSteps } from "@/hooks/use-onboarding-steps"
import { OnboardingStepDocuments } from "@/components/onboarding/OnboardingStepDocuments"
import { OnboardingStepAssistant } from "@/components/onboarding/OnboardingStepAssistant"
import { OnboardingStepIntegrations } from "@/components/onboarding/OnboardingStepIntegrations"
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons"
import { useOrganization } from "@/context/organization.context"
import { useState } from "react"
import { useZero } from "@/services/zero"
import { mutators } from "@lydie/zero/mutators"
import { Modal } from "@/components/generic/Modal"
import { Dialog } from "@/components/generic/Dialog"
import { Checkbox } from "@/components/generic/Checkbox"
import { DialogTrigger, Heading, Button as RACButton } from "react-aria-components"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

export const Route = createFileRoute("/__auth/w/$organizationSlug/")({
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

function Onboarding() {
  const {
    currentStep,
    nextStep,
    previousStep,
    completeOnboarding,
    getProgress,
    getCurrentStepIndex,
    getTotalSteps,
    isFirstStep,
    isLastStep,
  } = useOnboardingSteps()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const z = useZero()
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false)
  const [deleteDemoContent, setDeleteDemoContent] = useState(true)
  const [direction] = useState<"forward" | "backward">("forward")

  const progress = getProgress()


  const handleSkip = () => {
    completeOnboarding()
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: organization.slug },
    })
  }

  const handleNext = () => {
    if (isLastStep) {
      completeOnboarding()
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug: organization.slug },
      })
    } else {
      nextStep()
    }
  }

  const handleQuitIntro = () => {
    if (deleteDemoContent) {
      try {
        z.mutate(
          mutators.document.deleteAllOnboarding({
            organizationId: organization.id,
          }),
        )
        toast.success("Demo content deleted")
      } catch (error) {
        console.error("Failed to delete demo content:", error)
        toast.error("Failed to delete demo content")
      }
    }
    completeOnboarding()
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: organization.slug },
    })
    setIsQuitDialogOpen(false)
    setDeleteDemoContent(true)
  }


  const renderStepContent = () => {
    switch (currentStep) {
      case "documents":
        return <OnboardingStepDocuments />
      case "assistant":
        return <OnboardingStepAssistant />
      case "integrations":
        return <OnboardingStepIntegrations />
      default:
        return null
    }
  }

  return (
    <div className="flex items-center size-full justify-center">
      <div className="flex flex-col gap-y-6 max-w-lg">
        <div className="flex items-center gap-x-2">
          <CircularProgress progress={progress} size={20} progressColor="#9c9c9c" />
          <span className="text-xs text-gray-500">
            Step {getCurrentStepIndex() + 1} of {getTotalSteps()}
          </span>
        </div>
        <div className="min-h-[280px] relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              initial={{
                opacity: 0,
                x: direction === "forward" ? 20 : -20,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
                x: direction === "forward" ? -20 : 20,
              }}
              transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-x-2">
          <div className="flex items-center gap-x-2">
            {!isFirstStep && (
              <Button onPress={previousStep} intent="secondary" size="sm">
                <span className="flex items-center gap-x-1">
                  <ChevronLeftIcon className="size-4" />
                  Previous
                </span>
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button onPress={handleSkip} intent="secondary" size="sm">
              Skip
            </Button>
            <Button onPress={handleNext} intent="primary" size="sm">
              <span className="flex items-center gap-x-1">
                {isLastStep ? "Get started" : "Next"}
                {!isLastStep && <ChevronRightIcon className="size-4" />}
              </span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-x-4">
          <RACButton
            onPress={() => setIsQuitDialogOpen(true)}
            className="text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            Quit intro
          </RACButton>
          {import.meta.env.DEV && (
            <RACButton
              onPress={async () => {
                try {
                  await z.mutate(
                    mutators.organizationSettings.resetOnboarding({
                      organizationId: organization.id,
                    }),
                  )
                  toast.success("Onboarding reset successfully")
                } catch (error) {
                  console.error("Failed to reset onboarding:", error)
                  toast.error("Failed to reset onboarding")
                }
              }}
              className="text-xs font-medium text-orange-600 hover:text-orange-900"
            >
              [DEV] Reset Onboarding
            </RACButton>
          )}
        </div>

        <DialogTrigger
          isOpen={isQuitDialogOpen}
          onOpenChange={(isOpen) => {
            setIsQuitDialogOpen(isOpen)
            if (!isOpen) {
              setDeleteDemoContent(true) // Reset to default when dialog closes
            }
          }}
        >
          <Modal isDismissable size="md">
            <Dialog role="alertdialog">
              <div className="p-4 flex flex-col gap-y-4">
                <Heading slot="title" className="text-lg font-medium text-gray-900">
                  Quit intro
                </Heading>
                <p className="text-sm text-slate-600">Are you sure you want to quit the intro?</p>
                <div className="flex items-center">
                  <Checkbox isSelected={deleteDemoContent} onChange={setDeleteDemoContent}>
                    Delete demo content
                  </Checkbox>
                </div>
                <div className="flex gap-x-2 justify-end mt-2">
                  <Button intent="secondary" onPress={() => setIsQuitDialogOpen(false)} size="sm">
                    Cancel
                  </Button>
                  <Button intent="primary" onPress={handleQuitIntro} size="sm">
                    Quit intro
                  </Button>
                </div>
              </div>
            </Dialog>
          </Modal>
        </DialogTrigger>
      </div>
    </div>
  )
}
