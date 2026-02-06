import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { CircularProgress } from "@lydie/ui/components/generic/CircularProgress";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import clsx from "clsx";
import { useMemo } from "react";
import { TooltipTrigger } from "react-aria-components";

import { Link } from "@/components/generic/Link";
import { useOrganization } from "@/context/organization.context";

export function UsageStats() {
  const { organization } = useOrganization();

  // Get current user's credits for this workspace
  const [userCredits] = useQuery(
    queries.billing.userCredits({
      organizationId: organization.id,
    }),
  );

  // Get workspace billing info for plan details
  const [billing] = useQuery(
    queries.billing.byOrganizationId({
      organizationId: organization.id,
    }),
  );

  const creditBalance = userCredits?.credits_available ?? 0;
  const creditsIncluded = userCredits?.credits_included_monthly ?? 30;

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
  const maxCredits = creditsIncluded || planInfo.creditsPerSeat || 30;

  const isLowCredits = creditBalance <= maxCredits * 0.2; // Less than 20% remaining
  const isOutOfCredits = creditBalance === 0;

  const progress = useMemo(() => {
    if (maxCredits === 0) return 0;
    return Math.min((creditBalance / maxCredits) * 100, 100);
  }, [creditBalance, maxCredits]);

  const progressColor = useMemo(() => {
    if (isOutOfCredits) return "#ef4444"; // red
    if (isLowCredits) return "#f59e0b"; // amber
    return "var(--color-gray-900)";
  }, [isOutOfCredits, isLowCredits]);

  return (
    <TooltipTrigger>
      <Link
        to="/w/$organizationSlug/settings/billing"
        from="/w/$organizationSlug"
        className={clsx(
          "flex flex-col gap-2 px-3 py-2 rounded-lg border transition-colors",
          isOutOfCredits
            ? "bg-red-50 border-red-200 hover:border-red-300"
            : isLowCredits
              ? "bg-amber-50 border-amber-200 hover:border-amber-300"
              : "bg-gray-50 border-gray-200 hover:border-gray-300",
        )}
      >
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <CircularProgress progress={progress} size={16} progressColor={progressColor} />
            </div>
            <span className="text-xs font-medium text-gray-900">AI Credits</span>
          </div>
          <span className="text-gray-700 text-xs font-medium">
            {creditBalance.toLocaleString()}
          </span>
        </div>
      </Link>
      <Tooltip placement="right">
        {isOutOfCredits
          ? "Out of credits. Upgrade your plan to continue using AI features."
          : `${creditBalance} credits remaining this period`}
      </Tooltip>
    </TooltipTrigger>
  );
}
