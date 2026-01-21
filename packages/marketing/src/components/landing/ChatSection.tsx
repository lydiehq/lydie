import { Eyebrow } from "./Eyebrow"
import { Container } from "../Container"

const points = [
  {
    title: "Precise document editing",
    description:
      "Get AI-suggested changes that you can review and accept with a single click, right where you're writing.",
  },
  {
    title: "Full workspace context",
    description:
      "The AI understands your entire workspace, so it can answer questions and make suggestions based on all your documents.",
  },
]

interface ChatSectionProps {
  imageSrc: string
  imageSrcSet: string
  imageSizes: string
  imageAlt: string
  imageWidth?: number
  imageHeight?: number
}

export function ChatSection({
  imageSrc,
  imageSrcSet,
  imageSizes,
  imageAlt,
  imageWidth,
  imageHeight,
}: ChatSectionProps) {
  return (
    <section className="pt-px z-0 relative md:-mb-40">
      <div className="absolute inset-y-0 left-0 z-20 w-40 bg-linear-to-r from-white hidden md:block" />
      <div className="absolute -inset-x-4 -bottom-px z-20 hidden h-80 bg-linear-to-t from-white via-white md:block" />
      <Container className="relative flex flex-col items-center md:items-end py-4 md:flex-row md:py-0">
        <div className="relative flex flex-col-reverse md:flex-row gap-y-8 w-full">
          <div className="relative w-full md:-ml-[400px]">
            <div className="w-full md:w-[980px] md:h-[800px] z-10 relative p-2 bg-white ring ring-black/4 rounded-2xl">
              <img
                src={imageSrc}
                srcSet={imageSrcSet}
                sizes={imageSizes}
                alt={imageAlt}
                width={imageWidth}
                height={imageHeight}
                className="rounded-[10px] ring ring-black/8 shadow-legit w-full h-auto"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
          <div className="flex flex-col w-full md:w-[46ch] gap-4 ml-0 md:ml-4 mt-8 md:mt-20 relative z-10 pl-0 md:pl-8 py-2 rounded-3xl">
            <Eyebrow>AI Companion</Eyebrow>
            <h2 className="text-3xl md:text-4xl font-heading font-medium tracking-tight text-gray-800">
              Your AI writing <br /> companion, always ready.
            </h2>
            <span className="text-[15px]/relaxed text-gray-600 text-balance">
              Chat with AI that understands your entire workspace. Get suggestions, make edits, and improve
              your writing, all while staying in complete control.
            </span>
            {/* <hr className="border-gray-100 w-full my-4" />
            <div className="grid grid-cols-1 gap-6">
              {points.map((point, i) => (
                <div className="flex flex-col gap-y-2 shrink-0" key={i}>
                  <h3 className="font-medium text-[15px]/0 text-gray-900">
                    {point.title}
                  </h3>
                  <p className="text-[0.8125rem]/relaxed text-gray-600">
                    {point.description}
                  </p>
                </div>
              ))}
            </div> */}
          </div>
        </div>
      </Container>
    </section>
  )
}
