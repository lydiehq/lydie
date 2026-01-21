export interface OnboardingTask {
  id: string
  title: string
  description: string
  actionLabel: string
  prompt?: string
  path?: string
}

export const ONBOARDING_TASKS: OnboardingTask[] = [
  {
    id: "summarize-apollo",
    title: "Summarize Project Apollo",
    description: "Get a quick overview of what we've written about the project launch.",
    actionLabel: "Summarize",
    prompt: "Summarize what we've written about Project Apollo",
  },
  {
    id: "organize-apollo",
    title: "Organize Apollo documents",
    description: "Move all Project Apollo related documents into a dedicated folder.",
    actionLabel: "Organize",
    prompt: "Please move documents related to Project Apollo into a folder for itself",
  },
  {
    id: "invite-team",
    title: "Invite your team",
    description: "Collaborate by inviting your team members to this workspace.",
    actionLabel: "Invite Members",
    path: "/w/$organizationSlug/settings",
  },
  {
    id: "connect-integration",
    title: "Connect an integration",
    description: "Sync content from your favorite tools like GitHub or Linear.",
    actionLabel: "Connect Integration",
    path: "/w/$organizationSlug/settings/integrations",
  },
]
