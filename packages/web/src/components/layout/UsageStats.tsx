import { useOrganization } from "@/context/organization.context";
import { useAuth } from "@/context/auth.context";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { useMemo } from "react";
import clsx from "clsx";
import { Tooltip } from "../generic/Tooltip";
import { TooltipTrigger } from "react-aria-components";
import { Link } from "../generic/Link";

export function UsageStats() {
  const { organization } = useOrganization();
  const { session } = useAuth();

  const [todayUsage] = useQuery(
    queries.usage.today({ organizationId: organization.id })
  );

  const currentPlan = useMemo(() => {
    if (!organization) {
      return PLAN_TYPES.FREE;
    }

    const hasProAccess =
      organization.subscriptionPlan === "pro" &&
      organization.subscriptionStatus === "active";

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

    // Count user messages to track actual message sends
    const messagesUsedToday = todayUsage.filter(
      (usage: any) =>
        usage.source === "document" || usage.source === "assistant"
    ).length;

    return {
      messagesUsedToday,
    };
  }, [todayUsage]);

  const isAtLimit = usageStats.messagesUsedToday >= maxMessages;
  const isNearLimit =
    maxMessages > 0 && usageStats.messagesUsedToday >= maxMessages * 0.8;

  // Calculate progress percentage
  const progress = useMemo(() => {
    if (maxMessages === 0) return 0;
    return Math.min((usageStats.messagesUsedToday / maxMessages) * 100, 100);
  }, [usageStats.messagesUsedToday, maxMessages]);

  // Get color based on usage state
  const progressColor = useMemo(() => {
    if (isNearLimit) return "#f59e0b";
    return "var(--color-gray-900)";
  }, [isAtLimit, isNearLimit]);

  // Circular progress calculations
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

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
            : "bg-gray-50 border-gray-200 hover:border-gray-300"
        )}
      >
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="#e5e7eb"
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                {/* Progress circle */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={progressColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900">
              Free daily messages
            </span>
          </div>
          <span className="text-gray-700 text-xs font-medium">
            {usageStats.messagesUsedToday}/{maxMessages}
          </span>
        </div>
      </Link>
      <Tooltip placement="right">
        Upgrade to Pro for unlimited daily messages
      </Tooltip>
    </TooltipTrigger>
  );
}
