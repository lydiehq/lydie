import { twMerge } from "tailwind-merge"
import { useState, useEffect, useRef } from "react"

const shortStory = `
The developer stared at the terminal, watching their deployment fail for the third time. "It works on my machine," they muttered, knowing full well it was a lie. The error message was cryptic, as if written by someone who had never met a human being. "Cannot read property 'undefined' of undefined," it taunted.

They opened DevTools, because of course they did. The console was a graveyard of forgotten console.logs, each one a monument to past debugging sessions. "Why did I log 'here'? Where is here? When was here?" The questions haunted them like ghosts in the machine.

Suddenly, they noticed something odd in the blurred background of the landing page. Was that... text? They squinted, adjusted their monitor brightness, then remembered they were a developer. Right-click. Inspect Element. There it was, hidden in plain sight, blurred beyond recognition but perfectly readable in the source code.

"Hello, fellow developer," the text began. "If you're reading this, you've discovered our little secret. This blur effect isn't just for aesthetics—it's a test. A test to see who among you will dig deeper, who will right-click and inspect, who will find the hidden messages we've scattered throughout the codebase like digital breadcrumbs."

The developer chuckled. They had found the Easter egg. But wait, there was more. The story continued, revealing tales of late-night coding sessions, the existential dread of merge conflicts, and the pure joy of finally fixing that one bug that had been plaguing them for days.

"Remember," the text concluded, "every blur hides a story. Every comment contains a secret. Every console.log is a cry for help. Keep exploring, keep inspecting, keep discovering. The best code is the code that makes you smile when you find its secrets."

The developer closed DevTools, refreshed the page, and watched the typewriter effect play out again. This time, they knew what was being typed. They felt like they were in on a joke that only developers would understand. And honestly? That made their day.
`

type Props = {
	className: string
	startPercentage?: number // Percentage (0-100) of where to start the typewriter effect
}

export function AsciiBackground({ className, startPercentage = 50 }: Props) {
	const [displayedText, setDisplayedText] = useState("")
	const [isVisible, setIsVisible] = useState(false)
	const [hasStarted, setHasStarted] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const textRef = useRef<HTMLDivElement>(null)
	const animationFrameRef = useRef<number | undefined>(undefined)
	const currentIndexRef = useRef<number>(0)
	const lastUpdateTimeRef = useRef<number>(0)

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !hasStarted) {
						setIsVisible(true)
						setHasStarted(true)
					}
				})
			},
			{
				threshold: 0.1, // Trigger when 10% of the component is visible
			},
		)

		if (containerRef.current) {
			observer.observe(containerRef.current)
		}

		return () => {
			if (containerRef.current) {
				observer.unobserve(containerRef.current)
			}
		}
	}, [hasStarted])

	useEffect(() => {
		if (!isVisible) return

		const typingSpeed = 10 // milliseconds per character
		// Clamp percentage between 0 and 100, then calculate start index
		const clampedPercentage = Math.max(0, Math.min(100, startPercentage))
		const startIndex = Math.floor((shortStory.length * clampedPercentage) / 100)

		// Set initial text up to start percentage
		currentIndexRef.current = startIndex
		setDisplayedText(shortStory.slice(0, startIndex))

		// Use requestAnimationFrame for smoother, more performant updates
		// Batch updates to reduce re-renders (update every frame instead of every character)
		const animate = (timestamp: number) => {
			if (!lastUpdateTimeRef.current) {
				lastUpdateTimeRef.current = timestamp
			}

			const elapsed = timestamp - lastUpdateTimeRef.current
			const charsToAdd = Math.floor(elapsed / typingSpeed)

			if (charsToAdd > 0 && currentIndexRef.current < shortStory.length) {
				const newIndex = Math.min(currentIndexRef.current + charsToAdd, shortStory.length)
				currentIndexRef.current = newIndex

				// Direct DOM manipulation for better performance (avoids React re-render)
				if (textRef.current) {
					textRef.current.textContent = shortStory.slice(0, newIndex)
				}

				lastUpdateTimeRef.current = timestamp
			}

			if (currentIndexRef.current < shortStory.length) {
				animationFrameRef.current = requestAnimationFrame(animate)
			}
		}

		animationFrameRef.current = requestAnimationFrame(animate)

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
			}
			lastUpdateTimeRef.current = 0
		}
	}, [isVisible, startPercentage])

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			className={twMerge(
				"absolute overflow-hidden pointer-events-none select-none text-sm text-black/8 whitespace-pre-wrap blur-[2px]",
				className,
			)}
		>
			<div ref={textRef}>{displayedText}</div>
		</div>
	)
}
