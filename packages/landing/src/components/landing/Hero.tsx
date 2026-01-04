import { motion } from "motion/react";
import { AnimatedWord } from "../AnimatedWord";
import { AsciiBackground } from "./AsciiBackground";
import { WaitlistForm } from "./WaitlistForm";
import { Container } from "../Container";

interface HeroProps {
  imageSrc: string;
  imageSrcSet: string;
  imageSizes: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
}

export function Hero({
  imageSrc,
  imageSrcSet,
  imageSizes,
  imageAlt,
  imageWidth,
  imageHeight,
}: HeroProps) {
  return (
    <section className="-mb-20 z-0 relative">
      <div className="absolute inset-y-0 right-0 z-20 w-40 md:block hidden bg-linear-to-l from-white"></div>
      <div className="absolute -inset-x-4 -bottom-px z-20 hidden h-80 bg-linear-to-t from-white via-white md:block"></div>
      <Container className="flex flex-col items-center md:items-end py-4 md:flex-row md:py-0 relative">
        <motion.div
          className="inset-0 absolute hidden md:block"
          initial={{
            opacity: 0,
            filter: "blur(10px)",
          }}
          animate={{
            opacity: 1,
            filter: "blur(0px)",
          }}
          transition={{
            delay: 0.2,
            duration: 2,
          }}
        >
          <AsciiBackground
            className="w-[65ch] -left-10 inset-y-10 rounded-3xl"
            startPercentage={30}
          />
        </motion.div>
        <div className="relative flex flex-col gap-y-4 md:flex-row overflow-visible w-full">
          <div className="flex flex-col mr-0 gap-4 mt-0 md:mt-44 relative self-start z-10 to-20% to-white pr-0 py-2 rounded-3xl w-full md:w-[40ch] shrink-0 md:mr-8">
            <motion.h1
              className="text-5xl font-heading font-medium tracking-tight text-gray-800 md:text-start text-center"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    delayChildren: 0.5,
                    staggerChildren: 0.12,
                  },
                },
              }}
            >
              <AnimatedWord>Write</AnimatedWord>{" "}
              <AnimatedWord>once.</AnimatedWord>
              <br />
              <AnimatedWord>Use</AnimatedWord>{" "}
              <AnimatedWord>everywhere.</AnimatedWord>
            </motion.h1>
            <motion.span
              className="text-[15px]/relaxed text-gray-600 w-[220px] mx-auto md:w-full md:text-start md:mx-0 text-center md:text-balance"
              initial={{
                opacity: 0,
                x: -14,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: 1,
                x: 0,
                filter: "blur(0px)",
              }}
              transition={{
                delay: 0.8,
                duration: 0.8,
              }}
            >
              A document-first writing workspace that adapts to blogs, docs, and
              products - not the other way around.
            </motion.span>
            <motion.div className="flex items-center gap-x-1.5 w-full md:w-auto">
              <motion.div
                className="flex-1 w-full"
                initial={{
                  opacity: 0,
                  x: -14,
                  filter: "blur(10px)",
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                  filter: "blur(0px)",
                }}
                transition={{
                  delay: 1.1,
                  duration: 0.6,
                }}
              >
                <WaitlistForm />
              </motion.div>
            </motion.div>
          </div>
          <div className="relative w-full">
            <motion.div
              className="relative w-full md:w-[980px] h-auto md:h-[800px] z-10 p-2 bg-white ring ring-black/4 rounded-2xl mt-8"
              initial={{
                opacity: 0,
                x: -8,
                filter: "blur(2px)",
              }}
              animate={{
                opacity: 1,
                x: 0,
                filter: "blur(0px)",
              }}
              transition={{
                delay: 1,
                duration: 1,
                ease: "easeOut",
              }}
            >
              <img
                src={imageSrc}
                srcSet={imageSrcSet}
                sizes={imageSizes}
                alt={imageAlt}
                width={imageWidth}
                height={imageHeight}
                className="rounded-xl bg-cover bg-center ring ring-black/4 shadow-legit w-full h-auto"
                loading="eager"
                decoding="async"
              />
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}
