import { Button } from "@/components/generic/Button"
import { Heading } from "@/components/generic/Heading"
import { authClient } from "@/utils/auth"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"
import "@/styles/grainy-gradient.css"

export const Route = createFileRoute("/_landing/auth/")({
	component: RouteComponent,
	validateSearch: z.object({
		redirect: z.string().optional(),
	}),
})

function RouteComponent() {
	return (
		<div className="min-h-screen relative grainy-gradient-container custom-inner-shadow overflow-hidden">
			<div className="absolute bottom-0 inset-x-0 h-22 bg-linear-to-t from-black/20 z-20"></div>
			<svg className="grainy-gradient-svg">
				<filter id="noiseFilter">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.65"
						numOctaves="3"
						stitchTiles="stitch"
					></feTurbulence>
				</filter>
			</svg>
			<svg
				viewBox="0 0 256 256"
				xmlns="http://www.w3.org/2000/svg"
				style={{
					position: "absolute",
					top: "50%",
					right: "20%",
					transform: "translateY(-50%)",
					width: "2000px",
					pointerEvents: "none",
					zIndex: 2,
					color: "rgba(0, 0, 0, 0.2)",
				}}
			>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M41.27 222.049c-.67-.618-.218-1.727.695-1.712 37.82.621 81.574-4.599 123.467-20.608 31.858-12.175 62.564-30.604 88.556-57.154.664-.679 1.812-.141 1.699.802C248.073 206.82 193.944 256 128.302 256c-33.588 0-64.162-12.876-87.032-33.951ZM8.475 172.36a.985.985 0 0 1-.797-.643C2.71 158.076 0 143.354 0 128 0 57.308 57.443 0 128.302 0c53.062 0 98.601 32.136 118.129 77.965a.999.999 0 0 1-.072.916c-24.815 39.85-59.9 64.094-97.239 78.364-49.113 18.769-102.352 20.214-140.645 15.115Z"
					clipRule="evenodd"
				></path>
			</svg>
			<div className="relative z-10 flex items-center justify-center min-h-screen p-8 md:p-16">
				<div className="w-full max-w-lg">
					<div className="p-px ring ring-white/20 rounded-[9px] bg-white/10">
						<div className="p-16 size-full rounded-[8px]">
							<AuthBox />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

function AuthBox() {
	const [isPending, setIsPending] = useState(false)
	const { redirect } = Route.useSearch()

	const handleGoogleSignIn = async () => {
		setIsPending(true)
		try {
			const callbackURL = redirect ? `${window.location.origin}${redirect}` : window.location.origin
			await authClient.signIn.social({
				provider: "google",
				callbackURL,
			})
		} catch (error) {
			setIsPending(false)
		}
	}

	return (
		<div className="max-w-sm w-full gap-y-4 flex flex-col">
			<div className="flex flex-col gap-y-2">
				<Heading className="text-white">Welcome to Lydie</Heading>
				<p className="text-white/90">Sign in to your account to continue</p>
			</div>

			<Button
				intent="primary"
				className="w-full flex items-center justify-center gap-3 py-3"
				onPress={handleGoogleSignIn}
				isPending={isPending}
				size="lg"
			>
				<img src="/icons/google.svg" alt="Google" className="size-4 mr-2" />
				<span>Continue with Google</span>
			</Button>

			{/* <div className="text-xs text-gray-500 dark:text-gray-400">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div> */}
		</div>
	)
}
