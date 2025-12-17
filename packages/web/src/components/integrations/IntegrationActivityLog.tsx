import type { queries } from "@lydie/zero/queries";
import { Card } from "../layout/Card";
import type { QueryResultType } from "@rocicorp/zero";
import { AlertCircleIcon, CheckCircle2Icon, XIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";

type Props = {
  logs: QueryResultType<typeof queries.integrationActivityLogs.byConnection>;
};

export function IntegrationActivityLog({ logs }: Props) {
  return (
    <Card>
      <ul className="divide-y divide-black/6">
        {logs.map((log) => (
          <li
            key={log.id}
            className="p-2.5 hover:bg-black/1 first:rounded-t-lg last:rounded-b-lg transition-colors duration-75"
          >
            <div className="flex justify-between items-center">
              <div className="flex gap-x-2 items-center">
                <ActivityLogIcon status={log.activity_status} />
                <span className="text-sm font-medium text-gray-950">
                  {log.activity_status}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {formatDistanceToNow(new Date(log.created_at))}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {/* <pre>{JSON.stringify(logs, null, 2)}</pre> */}
    </Card>
  );
}

function ActivityLogIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2Icon className="size-4 text-green-500" />;
    case "error":
      return <XIcon className="size-4 text-red-500" />;
    case "conflict":
      return <AlertCircleIcon className="size-4 text-amber-500" />;
  }
}
