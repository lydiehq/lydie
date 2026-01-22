import { Button } from "@/components/generic/Button"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { useOrganization } from "@/context/organization.context"
import { Separator } from "@/components/generic/Separator"
import { Heading } from "@/components/generic/Heading"
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types"
import { useMemo, useState } from "react"
import {
  ArrowTrendingRegular,
  CalendarRegular,
  FlashRegular,
  ErrorCircleRegular,
  CheckmarkRegular,
  ArrowRightRegular,
  SparkleRegular,
} from "@fluentui/react-icons"
import { DialogTrigger } from "react-aria-components"
import { Modal } from "@/components/generic/Modal"
import { Dialog } from "@/components/generic/Dialog"
import { toast } from "sonner"
import { authClient } from "@/utils/auth"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { Card } from "@/components/layout/Card"
import { useTrackOnMount } from "@/hooks/use-posthog-tracking"
import { trackEvent } from "@/lib/posthog"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/billing")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context
    const { organizationSlug } = params
    // Preload billing data including LLM usage
    zero.run(queries.organizations.billing({ organizationSlug }))
  },
  ssr: false,
})

function RouteComponent() {
  const { organizationSlug } = useParams({
    from: "/__auth/w/$organizationSlug/settings/billing",
  })
  const { organization } = useOrganization()
  const [isUpgrading, setIsUpgrading] = useState(false)

  const [billingData] = useQuery(queries.organizations.billing({ organizationSlug }))

  // Track billing page viewed
  useTrackOnMount("billing_viewed", {
    organizationId: organization.id,
  })

  const currentPlan = useMemo(() => {
    if (!billingData) {
      return PLAN_TYPES.FREE
    }

    const hasProAccess =
      billingData.subscription_plan === "pro" && billingData.subscription_status === "active"

    return hasProAccess ? PLAN_TYPES.PRO : PLAN_TYPES.FREE
  }, [billingData])

  const planInfo = PLAN_LIMITS[currentPlan]

  // Calculate usage statistics
  const usageStats = useMemo(() => {
    if (!billingData?.llmUsage) {
      return {
        totalTokens: 0,
        totalRequests: 0,
      }
    }

    const totalTokens = billingData.llmUsage.reduce((sum: any, usage: any) => sum + usage.total_tokens, 0) || 0
    const totalRequests = billingData.llmUsage.length || 0

    return {
      totalTokens,
      totalRequests,
    }
  }, [billingData])

  const handleUpgrade = async () => {
    setIsUpgrading(true)

    // Track subscription upgrade initiation
    trackEvent("subscription_upgrade_initiated", {
      organizationId: organization.id,
      fromPlan: currentPlan,
      toPlan: "pro",
    })

    try {
      await authClient.checkout({
        slug: "pro",
        referenceId: organization.id,
      })
    } catch (error: any) {
      console.error("Upgrade error:", error)
      toast.error(error?.message || "Failed to start upgrade process")
      setIsUpgrading(false)
    }
  }

  const handleManageSubscription = async () => {
    try {
      await authClient.customer.portal()
    } catch (error: any) {
      console.error("Portal error:", error)
      toast.error(error?.message || "Failed to open customer portal")
    }
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Billing & Usage</Heading>
        <p className="text-sm text-gray-600 mt-1">Monitor your AI usage and manage your subscription</p>
      </div>
      <Separator />

      {/* Free Plan Upgrade Section */}
      {currentPlan === PLAN_TYPES.FREE && (
        <Card className="p-8 text-center">
          <ErrorCircleRegular className="size-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Free Plan</h3>
          <p className="text-sm text-gray-600 mb-6">
            You're currently on the free plan. Upgrade to Pro to unlock unlimited AI features.
          </p>
          <DialogTrigger>
            <Button>
              <SparkleRegular className="size-4 mr-2" />
              Upgrade to Pro
            </Button>
            <Modal isDismissable>
              <Dialog>
                <div className="p-6">
                  <Heading level={2} className="text-xl font-semibold mb-2">
                    Upgrade to Pro
                  </Heading>
                  <p className="text-sm text-gray-600 mb-6">Unlock unlimited AI features with Pro plan.</p>

                  {/* Pro Plan Card */}
                  <div className="max-w-md mx-auto">
                    <div className="relative rounded-lg border-2 p-6 transition-all border-blue-500 hover:border-blue-600">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">Pro Plan</h3>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            $20
                            <span className="text-sm font-normal text-gray-500">/mo</span>
                          </p>
                        </div>
                      </div>

                      <ul className="space-y-2 mb-4">
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Unlimited tokens</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Unlimited requests</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Background processing</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Priority support</span>
                        </li>
                      </ul>

                      <Button
                        onPress={() => {
                          handleUpgrade()
                        }}
                        isDisabled={isUpgrading}
                        className="w-full"
                        intent="primary"
                      >
                        {isUpgrading ? (
                          "Processing..."
                        ) : (
                          <>
                            Upgrade to Pro
                            <ArrowRightRegular className="size-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      <strong>✨ Pro Features</strong> - Get unlimited AI usage, priority support, and
                      advanced features.
                    </p>
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Need custom limits?</strong> Contact us for Enterprise pricing with unlimited
                      usage, dedicated support, and advanced features.
                    </p>
                  </div>

                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>⚠️ Early Alpha Disclaimer:</strong> The PRO plan may be subject to changes in
                      terms of token limitations and pricing as we are still figuring out our monetization
                      model during this early alpha phase.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button intent="secondary" isDisabled={isUpgrading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Dialog>
            </Modal>
          </DialogTrigger>
        </Card>
      )}

      {/* Current Plan - Only show for Pro users */}
      {currentPlan === PLAN_TYPES.PRO && (
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{planInfo.name} Plan</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${billingData?.subscription_status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                    }`}
                >
                  {billingData?.subscription_status || "active"}
                </span>
              </div>
              {planInfo.price.monthly !== null && (
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${(planInfo.price.monthly / 100).toFixed(0)}
                  <span className="text-sm font-normal text-gray-500">/month</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button intent="secondary" onPress={handleManageSubscription} size="sm">
                Manage Subscription
              </Button>
              <DialogTrigger>
                <Button intent="secondary" size="sm">
                  <SparkleRegular className="size-4 mr-2" />
                  Change Plan
                </Button>
                <Modal isDismissable>
                  <Dialog>
                    <div className="p-6">
                      <Heading level={2} className="text-xl font-semibold mb-2">
                        Manage Subscription
                      </Heading>
                      <p className="text-sm text-gray-600 mb-6">
                        Use the customer portal to manage your subscription, view invoices, and update payment
                        methods.
                      </p>

                      <div className="flex justify-end gap-2 mt-6">
                        <Button intent="secondary" size="sm">
                          Cancel
                        </Button>
                        <Button
                          onPress={() => {
                            handleManageSubscription()
                          }}
                          intent="primary"
                        >
                          Open Customer Portal
                        </Button>
                      </div>
                    </div>
                  </Dialog>
                </Modal>
              </DialogTrigger>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <CalendarRegular className="size-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Plan Status</p>
                <p className="text-sm font-medium text-gray-900">Active</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FlashRegular className="size-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Total Requests</p>
                <p className="text-sm font-medium text-gray-900">
                  {!billingData?.llmUsage ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : (
                    usageStats.totalRequests.toLocaleString()
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <ArrowTrendingRegular className="size-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Total Tokens</p>
                <p className="text-sm font-medium text-gray-900">
                  {!billingData?.llmUsage ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : (
                    usageStats.totalTokens.toLocaleString()
                  )}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
      {/* AI Usage */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md font-semibold text-gray-900">AI Usage</h3>
          {billingData?.llmUsage && billingData.llmUsage.length > 0 && (
            <span className="text-xs text-gray-500">{billingData.llmUsage.length} total requests</span>
          )}
        </div>

        {!billingData?.llmUsage ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Loading usage data...</p>
          </div>
        ) : billingData.llmUsage.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm mb-2">No usage data yet</p>
            <p className="text-xs">Start using the AI assistant to see your usage statistics here.</p>
          </div>
        ) : (
          <div className="flex justify-between items-center py-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-2xl font-semibold text-gray-900">{usageStats.totalRequests.toLocaleString()}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-sm text-gray-600">Total Tokens</p>
              <p className="text-2xl font-semibold text-gray-900">{usageStats.totalTokens.toLocaleString()}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ErrorCircleRegular className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 mb-1">Early Alpha Disclaimer</h3>
            <p className="text-sm text-amber-700">
              The PRO plan may be subject to changes in terms of token limitations, pricing, and features as
              we are still figuring out our monetization model during this early alpha phase. We'll notify you
              of any significant changes in advance.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
