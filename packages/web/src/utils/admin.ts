import type { User } from "better-auth"

export function isAdmin(user: User): boolean {
	return (user as any)?.role === "admin"
}
