import { useEffect, useState } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { UsersIcon } from "@/icons"

type AwarenessUser = {
	clientID: number
	user: {
		name: string
		color: string
	}
}

type Props = {
	provider: HocuspocusProvider | null
}

export function PresenceIndicators({ provider }: Props) {
	const [users, setUsers] = useState<AwarenessUser[]>([])
	const [isConnected, setIsConnected] = useState(false)

	useEffect(() => {
		if (!provider) return

		const awareness = provider.awareness

		const updateUsers = () => {
			const states = Array.from(awareness.getStates().entries())
			const activeUsers = states
				.filter(([clientID, state]) => {
					// Filter out current user and users without user data
					return clientID !== awareness.clientID && state.user && state.user.name
				})
				.map(([clientID, state]) => ({
					clientID,
					user: state.user as { name: string; color: string },
				}))

			setUsers(activeUsers)
		}

		const handleStatusChange = ({ status }: { status: string }) => {
			setIsConnected(status === "connected")
		}

		// Initial update
		updateUsers()
		setIsConnected(provider.status === "connected")

		// Listen for awareness changes
		awareness.on("change", updateUsers)
		provider.on("status", handleStatusChange)

		return () => {
			awareness.off("change", updateUsers)
			provider.off("status", handleStatusChange)
		}
	}, [provider])

	if (!provider) return null

	return (
		<div className="flex items-center gap-2">
			{/* Connection status */}
			<div className="flex items-center gap-1.5">
				<div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`} />
				<span className="text-xs text-gray-600">{isConnected ? "Connected" : "Connecting..."}</span>
			</div>

			{/* Active collaborators */}
			{users.length > 0 && (
				<div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
					<UsersIcon className="w-4 h-4 text-gray-500" />
					<div className="flex -space-x-2">
						{users.slice(0, 5).map((user) => (
							<div
								key={user.clientID}
								className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
								style={{ backgroundColor: user.user.color }}
								title={user.user.name}
							>
								{user.user.name.charAt(0).toUpperCase()}
							</div>
						))}
					</div>
					<span className="text-xs text-gray-600">
						{users.length} {users.length === 1 ? "person" : "people"} editing
					</span>
				</div>
			)}
		</div>
	)
}
