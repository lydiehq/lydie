import {
  ArrowTrendingRegular,
  CheckmarkRegular,
  ErrorCircleRegular,
  FlashRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { queries } from "@lydie/zero/queries";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import z from "zod";
import { DialogTrigger } from "react-aria-components";

import { Card } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/billing")({
  component: RouteComponent,
  validateSearch: (search) =>
    z.object({ session_id: z.string().optional() }).parse(search),
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

function RouteComponent() {
  const { organization } = useOrganization();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { session_id } = Route.useSearch();

  // Get workspace billing
  const [billing] = useQuery(
    queries.billing.byOrganizationId({
      organizationId: organization.id,
    }),
  );

  // Get user's credits for this workspace
  const [userCredits] = useQuery(
    queries.billing.userCredits({
      organizationId: organization.id,
    }),
  );

  // Get all members' credits (for admin view)
  const [allMembersCredits] = useQuery(
    queries.billing.allMembersCredits({
      organizationId: organization.id,
    }),
  );

  const currentPlan = useMemo(() => {
    if (!billing) {
      return PLAN_TYPES.FREE;
    }

    if (billing.plan === "monthly") {
      return PLAN_TYPES.MONTHLY;
    }
    if (billing.plan === "yearly") {
      return PLAN_TYPES.YEARLY;
    }

    return PLAN_TYPES.FREE;
  }, [billing]);

  const planInfo = PLAN_LIMITS[currentPlan];

  // Calculate usage statistics
  const usageStats = useMemo(() => {
    if (!userCredits) {
      return {
        creditsUsed: 0,
        creditsAvailable: planInfo.creditsPerSeat || 30,
        creditsIncluded: planInfo.creditsPerSeat || 30,
      };
    }

    return {
      creditsUsed: userCredits.credits_used_this_period || 0,
      creditsAvailable: userCredits.credits_available || 0,
      creditsIncluded: userCredits.credits_included_monthly || planInfo.creditsPerSeat || 30,
    };
  }, [userCredits, planInfo]);

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

      <div>
        <Heading level={1}>Billing & Usage</Heading>
        <p className="text-sm text-gray-600 mt-1">
          Monitor your AI usage and manage your subscription
        </p>
      </div>
      <Separator />

      {/* Free Plan Upgrade Section */}
      {currentPlan === PLAN_TYPES.FREE && (
        <Card className="p-8 text-center">
          <ErrorCircleRegular className="size-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Free Plan</h3>
          <p className="text-sm text-gray-600 mb-6">
            You&apos;re currently on the free plan with <strong>{planInfo.creditsPerSeat || 30} credits per month</strong>. 
            Upgrade to Pro for {PLAN_LIMITS[PLAN_TYPES.MONTHLY].creditsPerSeat} credits per month.
          </p>
          <DialogTrigger>
            <Button>
              <SparkleRegular className="size-4 mr-2" />
              Upgrade to Pro
            </Button>
            <Modal isDismissable>
              <Dialog>
                <div className="p-6">
                  <Heading level={2} className="text-xl font-semibold mb-4">
                    Choose Your Plan
                  </Heading>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Monthly Plan */}
                    <div className="border-2 border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">Monthly</h4>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            ${PLAN_LIMITS[PLAN_TYPES.MONTHLY].price}
                            <span className="text-sm font-normal text-gray-500">/seat/mo</span>
                          </p>
                          <p className="text-xs text-gray-500">Billed monthly</p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 mb-4">
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>{PLAN_LIMITS[PLAN_TYPES.MONTHLY].creditsPerSeat} credits/seat/month</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Start with 1 seat, add more anytime</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Priority support</span>
                        </li>
                      </ul>
                      <Button
                        onPress={() => handleUpgrade("monthly")}
                        isDisabled={isUpgrading}
                        className="w-full"
                        intent="primary"
                      >
                        {isUpgrading ? "Processing..." : "Upgrade Monthly"}
                      </Button>
                    </div>

                    {/* Yearly Plan */}
                    <div className="border-2 border-purple-500 rounded-lg p-4 relative">
                      <span className="absolute -top-2 right-4 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        Save 22%
                      </span>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">Yearly</h4>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            ${PLAN_LIMITS[PLAN_TYPES.YEARLY].price}
                            <span className="text-sm font-normal text-gray-500">/seat/mo</span>
                          </p>
                          <p className="text-xs text-gray-500">Billed annually</p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 mb-4">
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>{PLAN_LIMITS[PLAN_TYPES.YEARLY].creditsPerSeat} credits/seat/month</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Start with 1 seat, add more anytime</span>
                        </li>
                        <li className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckmarkRegular className="size-4 text-green-600 mt-0.5 shrink-0" />
                          <span>Priority support</span>
                        </li>
                      </ul>
                      <Button
                        onPress={() => handleUpgrade("yearly")}
                        isDisabled={isUpgrading}
                        className="w-full"
                        intent="primary"
                      >
                        {isUpgrading ? "Processing..." : "Upgrade Yearly"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      <strong>✨ Pro Features</strong> - Get {PLAN_LIMITS[PLAN_TYPES.MONTHLY].creditsPerSeat} credits per month per seat, priority support, and advanced features.
                    </p>
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Need custom limits?</strong> Contact us for Enterprise pricing with unlimited usage, dedicated support, and advanced features.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button intent="secondary">
                      Close
                    </Button>
                  </div>
                </div>
              </Dialog>
            </Modal>
          </DialogTrigger>
        </Card>
      )}

      {/* Current Plan - Show for Monthly/Yearly users */}
      {(currentPlan === PLAN_TYPES.MONTHLY || currentPlan === PLAN_TYPES.YEARLY) && (
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{planInfo.name} Plan</h2>
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
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${planInfo.price}
                <span className="text-sm font-normal text-gray-500">/seat/mo</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {currentPlan === PLAN_TYPES.MONTHLY ? "Billed monthly" : "Billed annually"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                intent="secondary" 
                size="sm"
                onPress={async () => {
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
                }}
              >
                Manage Subscription
              </Button>
            </div>
          </div>

          {billing?.cancel_at_period_end && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Subscription ending:</strong> Your subscription will be canceled at the end of the current billing period.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* AI Usage Statistics */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md font-semibold text-gray-900">Your AI Usage This Period</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <SparkleRegular className="size-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Credits Used</p>
              <p className="text-sm font-medium text-gray-900">
                {usageStats.creditsUsed.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FlashRegular className="size-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Credits Available</p>
              <p className="text-sm font-medium text-gray-900">
                {usageStats.creditsAvailable.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <ArrowTrendingRegular className="size-5 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Total Credits</p>
              <p className="text-sm font-medium text-gray-900">
                {usageStats.creditsIncluded.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ 
                width: `${Math.min(
                  (usageStats.creditsUsed / usageStats.creditsIncluded) * 100, 
                  100
                )}%` 
              }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-right">
            {Math.round((usageStats.creditsUsed / usageStats.creditsIncluded) * 100)}% used
          </p>
        </div>
      </Card>

      {/* Team Usage (Admin only) */}
      {allMembersCredits && allMembersCredits.length > 1 && (
        <Card className="p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-4">Team Usage</h3>
          <div className="space-y-3">
            {allMembersCredits.map((memberCredit) => (
              <div key={memberCredit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{memberCredit.user?.name || "Unknown"}</p>
                  <p className="text-xs text-gray-500">{memberCredit.user?.email || memberCredit.user_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {memberCredit.credits_used_this_period || 0} / {memberCredit.credits_included_monthly || 0} credits
                  </p>
                  <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full" 
                      style={{ 
                        width: `${Math.min(
                          ((memberCredit.credits_used_this_period || 0) / (memberCredit.credits_included_monthly || 1)) * 100, 
                          100
                        )}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ErrorCircleRegular className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 mb-1">Early Alpha Disclaimer</h3>
            <p className="text-sm text-amber-700">
              Our pricing plans may be subject to changes in terms of credit allocations, pricing,
              and features as we continue to optimize our offering during this early phase. We&apos;ll
              notify you of any significant changes in advance.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
