import { useEffect, useRef } from "react"
import { usePostHog } from "@/context/posthog.context"
import { useRouter } from "@tanstack/react-router"
import { posthog } from "@/lib/posthog"

// Check if PostHog should be enabled (always disabled in development)
const shouldEnablePostHog = () => {
	return !import.meta.env.DEV
}

export function usePageViewTracking() {
	const router = useRouter()
	const lastPathRef = useRef<string>("")

	useEffect(() => {
		const currentPath = window.location.pathname

		// Only track if the path has changed
		if (currentPath !== lastPathRef.current && posthog.__loaded && shouldEnablePostHog()) {
			posthog.capture("$pageview", {
				$current_url: window.location.href,
				path: currentPath,
			})
			lastPathRef.current = currentPath
		}

		// Subscribe to router navigation events
		const unsubscribe = router.subscribe("onResolved", ({ toLocation }) => {
			const newPath = toLocation.pathname

			if (newPath !== lastPathRef.current && posthog.__loaded && shouldEnablePostHog()) {
				posthog.capture("$pageview", {
					$current_url: window.location.href,
					path: newPath,
				})
				lastPathRef.current = newPath
			}
		})

		return () => {
			unsubscribe()
		}
	}, [router])
}

export function useTrackOnMount(
	eventName: string,
	properties?: Record<string, string | number | boolean | null | undefined>,
) {
	const { track } = usePostHog()
	const hasTracked = useRef(false)

	useEffect(() => {
		if (!hasTracked.current) {
			track(eventName, properties)
			hasTracked.current = true
		}
	}, [eventName, properties, track])
}
