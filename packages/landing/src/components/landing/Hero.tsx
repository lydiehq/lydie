import { Container } from "../Container";
import { motion } from "motion/react";
import { AnimatedWord } from "../AnimatedWord";
import { ChevronRight, Github } from "lucide-react";
import { AsciiBackground } from "./AsciiBackground";
import { Button } from "../generic/Button";

export function Hero() {
  return (
    <section className="-mb-20 z-0 relative">
      <div className="absolute inset-y-0 right-0 z-20 w-40 bg-linear-to-l from-white"></div>
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
          <div className="flex flex-col mr-0 gap-4 mt-8 md:mt-44 relative self-start z-10 to-20% to-white pr-0 py-2 rounded-3xl w-full md:w-[36ch] shrink-0 md:mr-8">
            <motion.h1
              className="text-4xl md:text-5xl font-heading font-medium tracking-tight text-gray-800"
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
              <AnimatedWord>smarter</AnimatedWord> <br />
              <AnimatedWord>with</AnimatedWord>{" "}
              <AnimatedWord>Lydie.</AnimatedWord>
            </motion.h1>
            <motion.span
              className="text-[15px]/relaxed text-gray-600"
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
              A writing environment that understands your documents and helps
              you stay in control.
            </motion.span>
            <motion.div className="flex items-center gap-x-1.5 w-full md:w-auto">
              <motion.div
                className="flex-1 md:flex-none"
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
                <Button
                  href="https://cloud.lydie.co/auth"
                  size="lg"
                  className="self-start w-full md:w-auto justify-center md:justify-start"
                >
                  <div className="flex items-center gap-x-1">
                    <span>Start writing</span>
                    <ChevronRight className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
                  </div>
                </Button>
              </motion.div>
              <motion.div
                className="flex-1 md:flex-none"
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
                  delay: 1.2,
                  duration: 0.6,
                }}
              >
                <Button
                  href="https://github.com/lsalling/lydie"
                  size="lg"
                  target="_blank"
                  intent="ghost"
                  className="self-start w-full md:w-auto justify-center md:justify-start"
                >
                  <div className="flex items-center gap-x-1.5">
                    <Github className="size-3.5" />
                    <span>Star on GitHub</span>
                  </div>
                </Button>
              </motion.div>
            </motion.div>
          </div>
          <div className="relative w-full">
            <motion.div
              className="relative w-full md:w-[980px] h-auto md:h-[800px] z-10 p-2 bg-white ring ring-black/4 rounded-2xl mt-8 md:-ml-4"
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
                src="/screenshot_sidebar.png"
                alt="Screenshot of the the Lydie platform including a sidebar with a document tree as well as the main WYSIWYG editor focusing on a document titled 'The Enduring Allure of Coffee'."
                height="1600"
                width="2360"
                className="rounded-xl bg-cover bg-center ring ring-black/4 shadow-legit w-full h-auto"
              />
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}
