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

  const progress = getProgress();

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
    <div className="flex p-8 bg-white shadow-surface rounded-xl gap-x-16 items-center size-full">
      {/* <div className="h-full rounded-lg bg-gray-100 w-[420px] relative overflow-hidden ring ring-black/8">
        <img src="/screenshot_sidebar.png" className="size-full object-cover" />
      </div> */}

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
          <span className="text-lg font-medium text-gray-900">
            {stepTitles[currentStep]}
          </span>
          {renderStepContent()}
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
            <div className="flex items-center gap-x-2">
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
        </div>
      </div>
    </div>
  );
}
