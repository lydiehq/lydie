import { useEffect, useState, type RefObject } from "react"
import { Pause, Play } from "lucide-react"
import { Button } from "react-aria-components"

type PlaybackState = {
	isPlaying: boolean
	progress: number
	duration: number
}

export function PreviewPlayButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
	const [playback, setPlayback] = useState<PlaybackState>({
		isPlaying: true,
		progress: 0,
		duration: 31,
	})

	useEffect(() => {
		if (!videoRef.current) return

		if (playback.isPlaying) {
			videoRef.current.play()
		} else {
			videoRef.current.pause()
		}
	}, [playback.isPlaying])

	useEffect(() => {
		if (!videoRef.current) return

		const video = videoRef.current
		const updateProgress = () => {
			setPlayback((prev) => ({
				...prev,
				progress: video.currentTime,
				duration: video.duration,
			}))
		}

		video.addEventListener("timeupdate", updateProgress)
		video.addEventListener("loadedmetadata", updateProgress)

		return () => {
			video.removeEventListener("timeupdate", updateProgress)
			video.removeEventListener("loadedmetadata", updateProgress)
		}
	}, [])

	const progressPercent = (playback.progress / playback.duration) * 100

	return (
		<div className="absolute -bottom-8 right-0 flex items-center gap-x-2">
			<Button
				className="relative p-1 text-gray-300 hover:text-gray-400"
				onPress={() => setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
				aria-label={`${playback.isPlaying ? "Pause" : "Play"}, ${Math.round(
					playback.progress,
				)} seconds of ${Math.round(playback.duration)} seconds`}
			>
				{playback.isPlaying ? <Pause size={16} /> : <Play size={16} />}
			</Button>
			<div className="relative w-10 h-1 rounded-full bg-black/5">
				<div
					className="absolute left-0 top-0 h-full rounded-full bg-gray-500 duration-100 transition-all"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>
		</div>
	)
}
