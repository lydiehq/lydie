import {
  ArrowClockwiseRegular,
  CheckmarkRegular,
  FlashRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DialogTrigger } from "react-aria-components";
import z from "zod";

import { Card } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/billing")({
  component: RouteComponent,
  validateSearch: (search) => z.object({ session_id: z.string().optional() }).parse(search),
  loader: async ({ context }) => {
    const { zero, organization } = context;

    const billing = zero.run(
      queries.billing.byOrganizationId({
        organizationId: organization.id,
      }),
    );

    const userCredits = zero.run(
      queries.billing.userCredits({
        organizationId: organization.id,
      }),
    );

    const allMembersCredits = zero.run(
      queries.billing.allMembersCredits({
        organizationId: organization.id,
      }),
    );

    return { billing, userCredits, allMembersCredits };
  },
  ssr: false,
});

function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function getDaysUntil(date: Date | string | number | null | undefined): number {
  if (!date) return 0;
  const end = new Date(date);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function RouteComponent() {
  const { organization } = useOrganization();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { session_id } = Route.useSearch();

  const [billing] = useQuery(
    queries.billing.byOrganizationId({
      organizationId: organization.id,
    }),
  );

  const [userCredits] = useQuery(
    queries.billing.userCredits({
      organizationId: organization.id,
    }),
  );

  const [allMembersCredits] = useQuery(
    queries.billing.allMembersCredits({
      organizationId: organization.id,
    }),
  );

  const currentPlan = useMemo(() => {
    if (!billing) return PLAN_TYPES.FREE;
    if (billing.plan === "monthly") return PLAN_TYPES.MONTHLY;
    if (billing.plan === "yearly") return PLAN_TYPES.YEARLY;
    return PLAN_TYPES.FREE;
  }, [billing]);

  const planInfo = PLAN_LIMITS[currentPlan];
  const isPaid = currentPlan !== PLAN_TYPES.FREE;

  // Calculate usage statistics
  const usageStats = useMemo(() => {
    const creditsUsed = userCredits?.credits_used_this_period ?? 0;
    const creditsAvailable = userCredits?.credits_available ?? planInfo.creditsPerSeat;
    const creditsIncluded = userCredits?.credits_included_monthly ?? planInfo.creditsPerSeat;
    const periodEnd = userCredits?.current_period_end ?? billing?.current_period_end;

    return {
      creditsUsed,
      creditsAvailable,
      creditsIncluded,
      periodEnd,
      daysUntilReset: getDaysUntil(periodEnd),
      percentUsed: creditsIncluded > 0 ? Math.round((creditsUsed / creditsIncluded) * 100) : 0,
    };
  }, [userCredits, billing, planInfo]);

  const handleUpgrade = async (plan: "monthly" | "yearly") => {
    setIsUpgrading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/internal/billing/checkout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": organization.id,
        },
        body: JSON.stringify({ plan }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Upgrade error:", error);
      alert(error.message || "Failed to start upgrade process. Please try again.");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/internal/billing/portal`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": organization.id,
        },
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Failed to open billing portal:", error);
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      {/* Success message after Stripe checkout */}
      {session_id && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckmarkRegular className="size-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900">Payment successful!</p>
              <p className="text-sm text-green-700">Your subscription has been activated.</p>
            </div>
          </div>
        </Card>
      )}

      <Heading level={1}>Billing</Heading>
      <Separator />

      {/* Current Plan */}
      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Current Plan"
          description={`You are on the ${planInfo.name} plan.`}
        />

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-gray-900">{planInfo.name}</h2>
                {isPaid && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      billing?.stripe_subscription_status === "active"
                        ? "bg-green-100 text-green-700"
                        : billing?.stripe_subscription_status === "past_due"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {billing?.stripe_subscription_status || "active"}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-bold text-gray-900">
                  ${isPaid ? planInfo.price : 0}
                </span>
                {isPaid && <span className="text-sm text-gray-500">/seat/month</span>}
              </div>

              <p className="text-sm text-gray-500 mt-1">
                {currentPlan === PLAN_TYPES.MONTHLY && "Billed monthly"}
                {currentPlan === PLAN_TYPES.YEARLY && "Billed annually"}
                {currentPlan === PLAN_TYPES.FREE && "Free forever"}
              </p>

              {billing?.cancel_at_period_end && (
                <p className="text-sm text-amber-600 mt-3">
                  Your subscription will end on {formatDate(billing?.current_period_end)}.
                </p>
              )}
            </div>

            {isPaid ? (
              <Button intent="secondary" size="sm" onPress={handleManageSubscription}>
                Manage Subscription
              </Button>
            ) : (
              <DialogTrigger>
                <Button intent="primary" size="sm">
                  <SparkleRegular className="size-4 mr-1.5" />
                  Upgrade
                </Button>
                <Modal isDismissable>
                  <Dialog>
                    <div className="p-6 max-w-lg">
                      <Heading level={2} className="text-xl font-semibold mb-4">
                        Upgrade to Pro
                      </Heading>
                      <p className="text-sm text-gray-600 mb-6">
                        Get {PLAN_LIMITS[PLAN_TYPES.MONTHLY].creditsPerSeat} AI credits per month
                        and priority support.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Monthly */}
                        <div className="border rounded-lg p-4 hover:border-gray-400 transition-colors">
                          <h4 className="font-medium text-gray-900">Monthly</h4>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            ${PLAN_LIMITS[PLAN_TYPES.MONTHLY].price}
                            <span className="text-sm font-normal text-gray-500">/mo</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">per seat</p>
                          <Button
                            onPress={() => handleUpgrade("monthly")}
                            isDisabled={isUpgrading}
                            className="w-full mt-4"
                            intent="secondary"
                            size="sm"
                          >
                            {isUpgrading ? "Processing..." : "Choose Monthly"}
                          </Button>
                        </div>

                        {/* Yearly */}
                        <div className="border-2 border-purple-500 rounded-lg p-4 relative">
                          <span className="absolute -top-2 left-4 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full">
                            Save 22%
                          </span>
                          <h4 className="font-medium text-gray-900">Yearly</h4>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            ${PLAN_LIMITS[PLAN_TYPES.YEARLY].price}
                            <span className="text-sm font-normal text-gray-500">/mo</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">per seat, billed annually</p>
                          <Button
                            onPress={() => handleUpgrade("yearly")}
                            isDisabled={isUpgrading}
                            className="w-full mt-4"
                            intent="primary"
                            size="sm"
                          >
                            {isUpgrading ? "Processing..." : "Choose Yearly"}
                          </Button>
                        </div>
                      </div>

                      <div className="flex justify-end mt-6">
                        <Button intent="secondary">Close</Button>
                      </div>
                    </div>
                  </Dialog>
                </Modal>
              </DialogTrigger>
            )}
          </div>
        </Card>
      </div>

      <Separator />

      {/* Credit Usage */}
      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="AI Credits"
          description="Credits are used for AI-powered features like writing assistance and document generation."
        />

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {usageStats.creditsAvailable.toLocaleString()} credits available
              </p>
              <p className="text-xs text-gray-500">
                of {usageStats.creditsIncluded.toLocaleString()} included
                {usageStats.periodEnd && (
                  <span className="ml-1">
                    · Resets{" "}
                    {usageStats.daysUntilReset === 0
                      ? "today"
                      : usageStats.daysUntilReset === 1
                        ? "tomorrow"
                        : `in ${usageStats.daysUntilReset} days`}{" "}
                    ({formatDate(usageStats.periodEnd)})
                  </span>
                )}
              </p>
            </div>
            <Button intent="secondary" size="sm" isDisabled>
              <ArrowClockwiseRegular className="size-4 mr-1.5" />
              Auto-refills
            </Button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(usageStats.percentUsed, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {usageStats.creditsUsed.toLocaleString()} used ({usageStats.percentUsed}%)
          </p>

          {/* Credit stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {usageStats.creditsAvailable.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Available</p>
            </div>
            <div className="text-center border-x">
              <p className="text-2xl font-semibold text-gray-900">
                {usageStats.creditsUsed.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Used this period</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {usageStats.creditsIncluded.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Total per period</p>
            </div>
          </div>
        </Card>

        {!isPaid && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <FlashRegular className="size-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Running low on credits?</p>
                <p className="text-sm text-blue-700 mt-0.5">
                  Upgrade to Pro for {PLAN_LIMITS[PLAN_TYPES.MONTHLY].creditsPerSeat} credits per
                  month and never worry about limits again.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Team Usage */}
      {allMembersCredits && allMembersCredits.length > 1 && (
        <>
          <Separator />
          <div className="flex flex-col gap-y-4">
            <SectionHeader heading="Team Usage" description="See how your team is using credits." />
            <Card className="p-6">
              <div className="space-y-4">
                {allMembersCredits.map((memberCredit) => (
                  <div key={memberCredit.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {memberCredit.user?.name || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {memberCredit.user?.email || memberCredit.user_id}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-medium text-gray-900">
                        {memberCredit.credits_used_this_period || 0} /{" "}
                        {memberCredit.credits_included_monthly || planInfo.creditsPerSeat}
                      </p>
                      <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{
                            width: `${Math.min(
                              ((memberCredit.credits_used_this_period || 0) /
                                (memberCredit.credits_included_monthly ||
                                  planInfo.creditsPerSeat ||
                                  1)) *
                                100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
