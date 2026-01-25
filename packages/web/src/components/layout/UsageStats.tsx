import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import clsx from "clsx";
import { useMemo } from "react";
import { TooltipTrigger } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";

import { CircularProgress } from "../generic/CircularProgress";
import { Link } from "../generic/Link";
import { Tooltip } from "../generic/Tooltip";

export function UsageStats() {
  const { organization } = useOrganization();

  const [todayUsage] = useQuery(queries.usage.today({ organizationId: organization.id }));

  const currentPlan = useMemo(() => {
    if (!organization) {
      return PLAN_TYPES.FREE;
    }

    const hasProAccess =
      organization.subscriptionPlan === "pro" && organization.subscriptionStatus === "active";

    return hasProAccess ? PLAN_TYPES.PRO : PLAN_TYPES.FREE;
  }, [organization]);

  const planInfo = PLAN_LIMITS[currentPlan];
  const maxMessages = planInfo.maxMessagesPerDay || 0;

  const usageStats = useMemo(() => {
    if (!todayUsage) {
      return {
        messagesUsedToday: 0,
      };
    }

    const messagesUsedToday = todayUsage.filter(
      (usage: any) => usage.source === "document" || usage.source === "assistant",
    ).length;

    return {
      messagesUsedToday,
    };
  }, [todayUsage]);

  const isAtLimit = usageStats.messagesUsedToday >= maxMessages;
  const isNearLimit = maxMessages > 0 && usageStats.messagesUsedToday >= maxMessages * 0.8;

  const progress = useMemo(() => {
    if (maxMessages === 0) return 0;
    return Math.min((usageStats.messagesUsedToday / maxMessages) * 100, 100);
  }, [usageStats.messagesUsedToday, maxMessages]);

  const progressColor = useMemo(() => {
    if (isNearLimit) return "#f59e0b";
    return "var(--color-gray-900)";
  }, [isAtLimit, isNearLimit]);

  return (
    <TooltipTrigger>
      <Link
        to="/w/$organizationSlug/settings/billing"
        from="/w/$organizationSlug"
        className={clsx(
          "flex flex-col gap-2 px-3 py-2 rounded-lg border transition-colors",
          isAtLimit
            ? "bg-red-50 border-red-200 hover:border-red-300"
            : isNearLimit
              ? "bg-amber-50 border-amber-200 hover:border-amber-300"
              : "bg-gray-50 border-gray-200 hover:border-gray-300",
        )}
      >
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <CircularProgress progress={progress} size={16} progressColor={progressColor} />
            </div>
            <span className="text-xs font-medium text-gray-900">Free daily messages</span>
          </div>
          <span className="text-gray-700 text-xs font-medium">
            {usageStats.messagesUsedToday}/{maxMessages}
          </span>
        </div>
      </Link>
      <Tooltip placement="right">Upgrade to Pro for unlimited daily messages</Tooltip>
    </TooltipTrigger>
  );
}
