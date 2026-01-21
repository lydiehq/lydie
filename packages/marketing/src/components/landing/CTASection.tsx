import { Container } from "../Container"
import { Button } from "../generic/Button"
import { ChevronRight } from "lucide-react"
import { HeroBackground } from "./HeroBackground"

export function CTASection() {
  return (
    <HeroBackground className="md:rounded-xl md:ring md:ring-black/20 relative md:px-4 -mb-32 md:-mb-40 z-10 mx-32">
      <Container className="flex flex-col gap-y-6 relative z-20 py-16 md:py-20">
        <div className="flex flex-col gap-y-4 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-heading font-medium tracking-tight text-white drop-shadow-text">
            Ready to transform your writing?
          </h2>
          {/* <p className="text-[15px] md:text-base text-white/90 leading-relaxed">
          </p> */}
          <div className="flex justify-center mt-4">
            <Button href="https://app.lydie.co/auth" size="lg" intent="primary">
              <div className="flex items-center gap-x-1">
                <span>Get started for free</span>
                <ChevronRight className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
              </div>
            </Button>
          </div>
        </div>
      </Container>
    </HeroBackground>
  )
}
