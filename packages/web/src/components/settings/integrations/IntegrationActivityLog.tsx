import { Card } from "@/components/layout/Card"
import { Alert24Filled, Check24Filled, Dismiss12Filled } from "@fluentui/react-icons"
import type { queries } from "@lydie/zero/queries"
import type { QueryResultType } from "@rocicorp/zero"
import { formatDistanceToNow } from "date-fns/formatDistanceToNow"

type Props = {
  logs: QueryResultType<typeof queries.integrationActivityLogs.byConnection>
}

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
                <span className="text-sm font-medium text-gray-950">{log.activity_status}</span>
              </div>
              <span className="text-sm text-gray-500">{formatDistanceToNow(new Date(log.created_at))}</span>
            </div>
          </li>
        ))}
      </ul>
      {/* <pre>{JSON.stringify(logs, null, 2)}</pre> */}
    </Card>
  )
}

function ActivityLogIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <Check24Filled className="size-4 text-green-500" />
    case "error":
      return <Dismiss12Filled className="size-4 text-red-500" />
    case "conflict":
      return <Alert24Filled className="size-4 text-amber-500" />
  }
}
