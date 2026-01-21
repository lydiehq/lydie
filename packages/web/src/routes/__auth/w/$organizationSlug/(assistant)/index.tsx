import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { Button } from "@/components/generic/Button";
import { Separator } from "@/components/generic/Separator";
import { CircularProgress } from "@/components/generic/CircularProgress";
import { useOnboardingSteps } from "@/hooks/use-onboarding-steps";
import { OnboardingStepDocuments } from "@/components/onboarding/OnboardingStepDocuments";
import { OnboardingStepAssistant } from "@/components/onboarding/OnboardingStepAssistant";
import { OnboardingStepIntegrations } from "@/components/onboarding/OnboardingStepIntegrations";
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import { useOrganization } from "@/context/organization.context";
import { useOnboardingChecklist } from "@/hooks/use-onboarding-checklist";
import { useAtom } from "jotai";
import { commandMenuStateAtom } from "@/stores/command-menu";
import { useEffect, useState, useRef } from "react";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";
import { Modal } from "@/components/generic/Modal";
import { Dialog } from "@/components/generic/Dialog";
import { Checkbox } from "@/components/generic/Checkbox";
import { DialogTrigger, Heading, Button as RACButton } from "react-aria-components";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full">
        <Onboarding />
      </Surface>
    </div>
  );
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
  } = useOnboardingSteps();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { setChecked } = useOnboardingChecklist();
  const [commandMenuState] = useAtom(commandMenuStateAtom);
  const z = useZero();
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false);
  const [deleteDemoContent, setDeleteDemoContent] = useState(true);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const previousStepRef = useRef(currentStep);

  const progress = getProgress();

  // Track direction of step changes
  useEffect(() => {
    const stepOrder = ["documents", "assistant", "integrations"];
    const currentIndex = stepOrder.indexOf(currentStep);
    const previousIndex = stepOrder.indexOf(previousStepRef.current);
    
    if (currentIndex > previousIndex) {
      setDirection("forward");
    } else if (currentIndex < previousIndex) {
      setDirection("backward");
    }
    
    previousStepRef.current = currentStep;
  }, [currentStep]);

  // Detect when command menu opens in search mode and mark it as checked
  useEffect(() => {
    if (
      commandMenuState.isOpen &&
      commandMenuState.initialPage === "search" &&
      currentStep === "documents"
    ) {
      setChecked("documents:search-menu", true);
    }
  }, [commandMenuState.isOpen, commandMenuState.initialPage, currentStep, setChecked]);

  const handleSkip = () => {
    completeOnboarding();
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: organization.slug },
    });
  };

  const handleNext = () => {
    if (isLastStep) {
      completeOnboarding();
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug: organization.slug },
      });
    } else {
      nextStep();
    }
  };

  const handleQuitIntro = () => {
    if (deleteDemoContent) {
      try {
        z.mutate(
          mutators.document.deleteAllOnboarding({
            organizationId: organization.id,
          })
        );
        toast.success("Demo content deleted");
      } catch (error) {
        console.error("Failed to delete demo content:", error);
        toast.error("Failed to delete demo content");
      }
    }
    completeOnboarding();
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: organization.slug },
    });
    setIsQuitDialogOpen(false);
    setDeleteDemoContent(true); // Reset to default for next time
  };

  const stepTitles = {
    documents: "Let's get you started!",
    assistant: "Meet your assistant",
    integrations: "Connect your tools",
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "documents":
        return <OnboardingStepDocuments />;
      case "assistant":
        return <OnboardingStepAssistant />;
      case "integrations":
        return <OnboardingStepIntegrations />;
      default:
        return null;
    }
  };

  return (
    <div className="flex p-8 bg-white shadow-surface rounded-xl gap-x-16 items-center size-full justify-center">

      <div className="">
        <div className="flex flex-col gap-y-6 max-w-lg">
          <div className="flex items-center gap-x-2">
            <CircularProgress
              progress={progress}
              size={20}
              progressColor="#9c9c9c"
            />
            <span className="text-xs text-gray-500">
              Step {getCurrentStepIndex() + 1} of {getTotalSteps()}
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`title-${currentStep}`}
              initial={{
                opacity: 0,
                y: -10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: 10,
              }}
              transition={{
                duration: 0.2,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="text-lg font-medium text-gray-900 block"
            >
              {stepTitles[currentStep]}
            </motion.span>
          </AnimatePresence>
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
                <Button
                  onPress={previousStep}
                  intent="secondary"
                  size="sm"
                >
                  <span className="flex items-center gap-x-1">
                    <ChevronLeftIcon className="size-4" />
                    Previous
                  </span>
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between">

              <Button
                onPress={handleSkip}
                intent="secondary"
                size="sm"
              >
                Skip
              </Button>
              <Button
                onPress={handleNext}
                intent="primary"
                size="sm"
              >
                <span className="flex items-center gap-x-1">
                  {isLastStep ? "Get started" : "Next"}
                  {!isLastStep && <ChevronRightIcon className="size-4" />}
                </span>
              </Button>
            </div>

          </div>
          <div>
            <RACButton
              onPress={() => setIsQuitDialogOpen(true)}
              className="text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              Quit intro
            </RACButton>
          </div>


          <DialogTrigger
            isOpen={isQuitDialogOpen}
            onOpenChange={(isOpen) => {
              setIsQuitDialogOpen(isOpen);
              if (!isOpen) {
                setDeleteDemoContent(true); // Reset to default when dialog closes
              }
            }}
          >
            <Modal isDismissable size="md">
              <Dialog role="alertdialog">
                <div className="p-6 flex flex-col gap-y-4">
                  <Heading slot="title" className="text-lg font-medium text-gray-900">
                    Quit intro
                  </Heading>
                  <p className="text-sm text-slate-600">
                    Are you sure you want to quit the intro?
                  </p>
                  <div className="flex items-center">
                    <Checkbox
                      isSelected={deleteDemoContent}
                      onChange={setDeleteDemoContent}
                    >
                      Delete demo content
                    </Checkbox>
                  </div>
                  <div className="flex gap-x-2 justify-end mt-2">
                    <Button
                      intent="secondary"
                      onPress={() => setIsQuitDialogOpen(false)}
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      intent="primary"
                      onPress={handleQuitIntro}
                      size="sm"
                    >
                      Quit intro
                    </Button>
                  </div>
                </div>
              </Dialog>
            </Modal>
          </DialogTrigger>
        </div>
      </div>
    </div>
  );
}
