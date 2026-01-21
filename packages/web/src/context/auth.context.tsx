import { useRouteContext } from "@tanstack/react-router"

export function useAuth() {
	const { auth } = useRouteContext({
		from: "/__auth",
	})

	return auth
}
