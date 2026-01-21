import { motion } from "motion/react"
import { useEffect, useRef, useId } from "react"

interface GradientBackgroundProps {
  imageSrc: string
  imageAlt: string
  className?: string
  position?: "left" | "right"
}

export function GradientBackground({
  imageSrc,
  imageAlt,
  className = "",
  position = "right",
}: GradientBackgroundProps) {
  const filterId = useId()
  const gradientBgRef = useRef<HTMLDivElement>(null)
  const interBubbleRef = useRef<HTMLDivElement>(null)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const curPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (gradientBgRef.current) {
        const rect = gradientBgRef.current.getBoundingClientRect()
        // Calculate mouse position relative to container center
        mousePosRef.current = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        }
      }
    }

    window.addEventListener("mousemove", handleMouseMove)

    const animate = () => {
      if (interBubbleRef.current) {
        const tgX = mousePosRef.current.x
        const tgY = mousePosRef.current.y
        const curX = curPosRef.current.x
        const curY = curPosRef.current.y

        const newX = curX + (tgX - curX) / 20
        const newY = curY + (tgY - curY) / 20

        curPosRef.current = { x: newX, y: newY }
        interBubbleRef.current.style.transform = `translate(${Math.round(newX)}px, ${Math.round(newY)}px)`
      }
      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [])

  const positionClasses = position === "left" ? "right-[calc(46ch+4rem)]" : "left-[calc(46ch+1rem)]"

  return (
    <motion.div
      ref={gradientBgRef}
      className={`rounded-2xl border border-lime-800/12 p-5 flex ${positionClasses} md:absolute aspect-2360/1600 inset-y-[5%] gradient-bg ${className}`}
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      transition={{
        delay: 0.8,
        duration: 0.8,
        ease: "easeOut",
      }}
    >
      <svg>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="gradients-container" style={{ filter: `url(#${filterId}) blur(40px)` }}>
        <div className="g1"></div>
        <div className="g2"></div>
        <div className="g3"></div>
        <div className="g4"></div>
        <div className="g5"></div>
        <div className="interactive" ref={interBubbleRef}></div>
      </div>
      <img
        aria-label={imageAlt}
        src={imageSrc}
        height={1600}
        width={2360}
        className="rounded-lg shrink-0 ring-1 ring-black/2 relative z-10 shadow-legit  "
      />
    </motion.div>
  )
}
