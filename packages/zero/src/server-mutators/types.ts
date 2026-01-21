import { defineMutator } from "@rocicorp/zero"

export type ServerMutator = (context: {
	asyncTasks: Array<() => Promise<void>>
}) => ReturnType<typeof defineMutator>
