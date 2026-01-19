import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { Button } from "@/components/generic/Button";
import { CheckIcon, ArrowRightIcon } from "lucide-react";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { mutators } from "@lydie/zero/mutators";
import { clsx } from "clsx";
import { ONBOARDING_TASKS, type OnboardingTask } from "@/constants/onboarding";
import { Separator } from "@/components/generic/Separator";
import { motion } from "motion/react";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { organizationSlug } = Route.useParams();
  const navigate = useNavigate();
  const z = useZero();

  const [settings] = useQuery(
    queries.settings.organization({ organizationId: organization.id })
  );

  const completedTasks = ((settings?.onboarding_status as any)?.completedTasks as string[]) || [];

  const handleTaskAction = (task: OnboardingTask) => {
    // Optimistically mark as complete
    if (!completedTasks.includes(task.id)) {
      z.mutate(
        mutators.organizationSettings.update({
          organizationId: organization.id,
          onboardingStatus: {
            completedTasks: [...completedTasks, task.id],
            dismissed: false,
          },
        })
      );
    }

    if (task.prompt) {
      navigate({
        to: "/w/$organizationSlug/assistant",
        params: { organizationSlug },
        search: { prompt: task.prompt },
      });
    } else if (task.path) {
      navigate({
        to: task.path,
        params: { organizationSlug },
      });
    }
  };

  const progress = Math.round((completedTasks.length / ONBOARDING_TASKS.length) * 100);
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const handlePromptClick = (prompt: string) => {
    navigate({
      to: "/w/$organizationSlug/assistant",
      params: { organizationSlug },
      search: { prompt },
    });
  };

  const promptButtons = [
    {
      title: "Organize documents",
      prompt: "Please organize our documents",
    },
    {
      title: "Create a new document",
      prompt: "Please create a new document",
    },
    {
      title: "Delete documents",
      prompt: "Please help me delete documents",
    },
  ];

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full grid grid-cols-1">
        <div className="flex items-center justify-center size-full">
          <div className="p-12">
            <div className="flex flex-col gap-y-6 max-w-lg">

              <div className="flex items-center gap-x-2">
                <svg width={size} height={size} className="transform -rotate-90">
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#e5e7eb"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#9c9c9c"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>
              </div>
              <span className="text-lg font-medium text-gray-900">Let's get you started!</span>
              <p className="text-gray-700 text-sm/relaxed">We&apos;ve created a few documents for you to get started. Use the assistant chat to help you organize and find your documents.</p>
              <div className="flex items-center gap-x-1">
                {promptButtons.map(({ title, prompt }) => (
                  <Button
                    key={title}
                    onPress={() => handlePromptClick(prompt)}
                    intent="secondary"
                    size="sm"
                    rounded
                  >
                    {title}
                  </Button>
                ))}
              </div>
              <Separator />
              <Button intent="secondary" size="sm">Skip and delete documents</Button>
            </div>
          </div>
        </div>
        {/* <div className="bg-gray-50 border-l border-gray-200 size-full"></div> */}

      </Surface>
    </div>
  )



  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full">
        <div className="max-w-3xl mx-auto w-full px-8 py-12 flex flex-col gap-12">

          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-medium text-gray-900">
              Welcome to Lydie, {user.name?.split(" ")[0]}!
            </h1>
            <p className="text-gray-500 text-lg max-w-xl">
              Let's get your workspace set up. Follow these steps to get the most out of Lydie.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span>Your Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid gap-4">
            {ONBOARDING_TASKS.map((task) => {
              const isCompleted = completedTasks.includes(task.id);
              return (
                <div
                  key={task.id}
                  className={clsx(
                    "group relative flex items-start gap-4 p-6 rounded-xl border transition-all duration-200",
                    isCompleted
                      ? "bg-gray-50 border-gray-200"
                      : "bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm"
                  )}
                >
                  <div className={clsx(
                    "flex-none flex items-center justify-center w-6 h-6 rounded-full border transition-colors",
                    isCompleted
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-gray-300 text-transparent"
                  )}>
                    <CheckIcon className="w-3.5 h-3.5" strokeWidth={3} />
                  </div>

                  <div className="flex-1 flex flex-col gap-1">
                    <h3 className={clsx("font-medium", isCompleted ? "text-gray-500 line-through" : "text-gray-900")}>
                      {task.title}
                    </h3>
                    <p className={clsx("text-sm", isCompleted ? "text-gray-400" : "text-gray-500")}>
                      {task.description}
                    </p>
                  </div>

                  <div className="flex-none">
                    {!isCompleted && (
                      <Button
                        size="sm"
                        intent="secondary"
                        className="group-hover:opacity-100 opacity-0 transition-opacity"
                        onPress={() => handleTaskAction(task)}
                      >
                        {task.actionLabel}
                        <ArrowRightIcon className="ml-2 w-3.5 h-3.5 opacity-50" />
                      </Button>
                    )}
                    {isCompleted && (
                      <Button
                        size="sm"
                        intent="ghost"
                        className="opacity-50 pointer-events-none"
                      >
                        Completed
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </Surface>
    </div>
  );
}


