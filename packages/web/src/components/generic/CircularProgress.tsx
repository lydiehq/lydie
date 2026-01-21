import { useMemo } from "react"
import clsx from "clsx"

export interface CircularProgressProps {
  /** Progress value from 0 to 100 */
  progress: number
  /** Size of the circle in pixels */
  size?: number
  /** Width of the stroke */
  strokeWidth?: number
  /** Color of the background circle */
  backgroundColor?: string
  /** Color of the progress circle */
  progressColor?: string
  /** Additional className for the SVG element */
  className?: string
  /** Additional className for the progress circle */
  progressClassName?: string
}

export function CircularProgress({
  progress,
  size = 20,
  strokeWidth = 2,
  backgroundColor = "#e5e7eb",
  progressColor = "#9c9c9c",
  className,
  progressClassName,
}: CircularProgressProps) {
  const { radius, circumference, offset } = useMemo(() => {
    const r = (size - strokeWidth) / 2
    const c = 2 * Math.PI * r
    const o = c - (Math.min(Math.max(progress, 0), 100) / 100) * c
    return { radius: r, circumference: c, offset: o }
  }, [size, strokeWidth, progress])

  return (
    <svg width={size} height={size} className={clsx("transform -rotate-90", className)}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={backgroundColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={progressColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={clsx("transition-all duration-300", progressClassName)}
      />
    </svg>
  )
}
