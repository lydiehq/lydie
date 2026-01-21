import { createFileRoute } from "@tanstack/react-router"
import { Separator } from "@/components/generic/Separator"
import { Heading } from "@/components/generic/Heading"
import { SectionHeader } from "@/components/generic/SectionHeader"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { useZero } from "@/services/zero"
import { toast } from "sonner"
import { RadioGroup, Radio } from "@/components/generic/RadioGroup"
import { useOrganization } from "@/context/organization.context"
import { PROMPT_STYLES } from "@lydie/core/prompts"
import { useMemo, useState, useEffect } from "react"
import { TextArea } from "react-aria-components"
import { Button } from "@/components/generic/Button"
import { Label } from "@/components/generic/Field"
import { Link } from "@/components/generic/Link"
import { mutators } from "@lydie/zero/mutators"
import { Card } from "@/components/layout/Card"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/ai")({
  component: RouteComponent,
})

function RouteComponent() {
  const { organization } = useOrganization()
  const z = useZero()
  const [customPromptInput, setCustomPromptInput] = useState("")

  const [userSettings] = useQuery(queries.settings.user({}))

  const isPro = useMemo(() => {
    if (!organization) return false
    return organization.subscriptionPlan === "pro" && organization.subscriptionStatus === "active"
  }, [organization])

  const currentStyle = userSettings?.ai_prompt_style || "default"
  const hasCustomPrompt = !!userSettings?.custom_prompt

  // Initialize custom prompt input when settings load
  useEffect(() => {
    if (userSettings?.custom_prompt && customPromptInput === "") {
      setCustomPromptInput(userSettings.custom_prompt)
    }
  }, [userSettings?.custom_prompt, customPromptInput])

  const handleStyleChange = async (value: string) => {
    try {
      z.mutate(
        mutators.userSettings.update({
          aiPromptStyle: value,
          customPrompt: null,
        }),
      )
      setCustomPromptInput("")
      toast.success("AI writing style updated")
    } catch (error) {
      toast.error("Failed to update AI writing style")
      console.error("Settings update error:", error)
    }
  }

  const handleUseCustomPrompt = () => {
    try {
      z.mutate(
        mutators.userSettings.update({
          aiPromptStyle: "default", // Reset to default when using custom
          customPrompt: customPromptInput.trim() || null,
        }),
      )
      toast.success("Using custom prompt")
    } catch (error) {
      toast.error("Failed to use custom prompt")
      console.error("Settings update error:", error)
    }
  }

  const handleClearCustomPrompt = async () => {
    try {
      z.mutate(
        mutators.userSettings.update({
          customPrompt: null,
        }),
      )
      setCustomPromptInput("")
      toast.success("Custom prompt cleared")
    } catch (error) {
      toast.error("Failed to clear custom prompt")
      console.error("Settings update error:", error)
    }
  }

  // Handle loading state - userSettings will be undefined while loading
  if (userSettings === undefined) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>AI Settings</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>AI Settings</Heading>
      </div>
      <Separator />

      {/* AI Writing Style Section */}
      <div className="flex flex-col gap-y-6">
        <SectionHeader
          heading="Writing Style"
          description="Choose the writing style that the AI will use when helping you with your documents."
          descriptionClassName="text-sm/relaxed text-gray-700"
        />

        <Card className="p-6 space-y-4">
          <RadioGroup
            label="AI Writing Style"
            value={currentStyle}
            onChange={handleStyleChange}
            orientation="vertical"
          >
            {PROMPT_STYLES.map((style) => (
              <Radio key={style.value} value={style.value}>
                <div className="flex flex-col gap-y-2 w-full">
                  <div className="flex flex-col gap-y-0.5">
                    <span className="font-medium">{style.label}</span>
                    <span className="text-xs text-gray-500">{style.description}</span>
                  </div>
                  <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
                    <p className="text-xs text-gray-600 leading-relaxed">{style.prompt}</p>
                  </div>
                </div>
              </Radio>
            ))}
          </RadioGroup>
        </Card>

        {/* Custom Prompt Section (PRO only) */}
        {isPro && (
          <div className="flex flex-col gap-y-6">
            <SectionHeader
              heading="Custom Prompt"
              description="Create your own custom AI personality. This will override the selected writing style above."
              descriptionClassName="text-sm/relaxed text-gray-700"
            />

            <Card className="p-6 space-y-4">
              {hasCustomPrompt && (
                <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                  <p className="text-xs text-blue-800 font-medium mb-1">Using custom prompt</p>
                  <p className="text-xs text-blue-700 leading-relaxed">{userSettings.custom_prompt}</p>
                </div>
              )}

              <div className="flex flex-col gap-y-2">
                <Label className="text-sm font-medium text-gray-900">Custom AI Personality</Label>
                <TextArea
                  value={customPromptInput}
                  onChange={(e) => setCustomPromptInput(e.target.value)}
                  placeholder="You are a..."
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-y"
                />
                <p className="text-xs text-gray-500">
                  Describe how you want the AI to behave and write. This will replace the standard writing
                  style prompts.
                </p>
              </div>

              <div className="flex gap-x-2">
                <Button size="sm" onPress={handleUseCustomPrompt} isDisabled={!customPromptInput.trim()}>
                  {hasCustomPrompt ? "Update Custom Prompt" : "Use Custom Prompt"}
                </Button>
                {hasCustomPrompt && (
                  <Button size="sm" intent="secondary" onPress={handleClearCustomPrompt}>
                    Clear Custom Prompt
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* PRO Upgrade Prompt */}
        {!isPro && (
          <Card className="p-6">
            <div className="flex flex-col gap-y-3">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">Unlock Custom Prompts</h3>
                <p className="text-xs text-gray-600">
                  Upgrade to Pro to create custom AI personalities tailored to your specific writing needs.
                </p>
              </div>
              <Link to="/w/$organizationSlug/settings/billing" params={{ organizationId: organization.id }}>
                <Button size="sm">Upgrade to Pro</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
