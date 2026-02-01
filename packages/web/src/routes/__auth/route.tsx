import { ZeroProvider, useZero } from "@rocicorp/zero/react";
import {
	createFileRoute,
	Outlet,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useRef } from "react";

import { schema } from "@lydie/zero/schema";
import { mutators } from "@lydie/zero/mutators";
import type { Zero } from "@rocicorp/zero";

const cacheURL = import.meta.env.VITE_ZERO_URL;

export const Route = createFileRoute("/__auth")({
	component: RouteComponent,
	beforeLoad: async ({ context }) => {
		// Check auth in beforeLoad where redirect() works properly
		const { session } = context as any;
		
		if (!session?.session) {
			throw redirect({ to: "/auth" });
		}
		
		return context;
	},
	ssr: false,
});

function RouteComponent() {
	const router = useRouter();
	// Use session from router context (loaded by root route's beforeLoad)
	const { session } = Route.useRouteContext() as any;
	
	const context = session?.session;
	const userID = session?.session?.userId ?? "anon";
	
	// Track if we've already initialized to prevent infinite loop
	const hasInitialized = useRef(false);

	const init = useCallback(
		(zero: Zero) => {
			if (hasInitialized.current) {
				// Already initialized, don't update again
				return;
			}
			
			console.log("[Zero] Initialized with userID:", userID);
			hasInitialized.current = true;
			
			// Update router context with zero instance
			router.update({
				context: {
					...router.options.context,
					zero,
				},
			});
			
			// Don't invalidate - it causes infinite loop
			// router.invalidate();
		},
		[router, userID],
	);

	return (
		<ZeroProvider
			schema={schema}
			userID={userID}
			context={context}
			server={cacheURL}
			mutators={mutators}
			init={init}
		>
			<ZeroGate>
				<Outlet />
			</ZeroGate>
		</ZeroProvider>
	);
}

/**
 * ZeroGate - Only renders children when Zero is ready
 */
function ZeroGate({ children }: { children: React.ReactNode }) {
	const zero = useZero();
	
	if (!zero) {
		return <div>Loading...</div>;
	}
	
	return <>{children}</>;
}
