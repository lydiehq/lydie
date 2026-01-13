import { Container } from "../Container";
import { Button } from "../generic/Button";
import screenshotNew from "../../../public/screenshot_new.png";
import "../../styles/grainy-gradient.css";
import styles from "./Hero.module.css";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

const imageSrc = screenshotNew.src;
const imageAlt =
  "Screenshot of the the Lydie platform including a sidebar with a document tree as well as the main WYSIWYG editor focusing on a document titled 'The Enduring Allure of Coffee'.";

export function Hero() {
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoClick = async () => {
    setIsLoading(true);

    // Mock loading for 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsLoading(false);
  };

  return (
    <div className="md:px-4 mb-32">
      <div className="md:rounded-xl custom-inner-shadow grainy-gradient-container md:ring md:ring-black/20 relative md:px-4">
        <div className="absolute bottom-0 inset-x-0 h-22 bg-linear-to-t from-black/20 z-20 gradient-overlay"></div>
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
          className={styles.embossedLogo}
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M41.27 222.049c-.67-.618-.218-1.727.695-1.712 37.82.621 81.574-4.599 123.467-20.608 31.858-12.175 62.564-30.604 88.556-57.154.664-.679 1.812-.141 1.699.802C248.073 206.82 193.944 256 128.302 256c-33.588 0-64.162-12.876-87.032-33.951ZM8.475 172.36a.985.985 0 0 1-.797-.643C2.71 158.076 0 143.354 0 128 0 57.308 57.443 0 128.302 0c53.062 0 98.601 32.136 118.129 77.965a.999.999 0 0 1-.072.916c-24.815 39.85-59.9 64.094-97.239 78.364-49.113 18.769-102.352 20.214-140.645 15.115Z"
            clipRule="evenodd"
          ></path>
        </svg>
        <Container className="flex flex-col relative z-20 pb-20 md:pb-16 md:pt-28 pt-20">
          <div className="flex flex-col gap-y-3 max-w-2xl text-center mx-auto">
            <div
              className={`mb-4 rounded-full bg-white/15 self-center px-2.5 py-[3px] flex items-center gap-x-1.5 ${styles.heroBadge}`}
              style={{
                boxShadow:
                  "0 1px rgba(255,255,255,0.2) inset, 0 1px 3px rgba(0,0,0,0.1), 0 1px 1.5px 0 rgba(0,0,0,0.05), 0 0 1.5px 0 rgba(0,0,0,0.1), 0 0 40px rgba(255,255,255,0.05), 0 0 80px rgba(255,255,255,0.02), 0 0 120px rgba(255,255,255,0.02)",
              }}
            >
              <span className="text-[12px] font-medium text-white">
                Now in open beta!
              </span>
            </div>
            <h1 className="text-5xl font-heading font-medium tracking-tight text-white drop-shadow-text">
              <span className={styles.heroWord1}>Centralize</span>{" "}
              <span className={styles.heroWord2}>your</span>{" "}
              <span className={styles.heroWord3}>writing</span>
            </h1>
            <p className="text-[17px]/relaxed text-white/90 text-balance">
              <span className={styles.heroSentence1}>
                Lydie is a writing workspace that adapts to your needs.
              </span>
              <br />
              <span className={styles.heroSentence2}>
                An open-source alternative to Google Docs, Notion and others.
              </span>
            </p>
            <div className="flex items-center justify-center gap-x-1.5 mt-4">
              <div
                className={`${styles.heroButton1} ring ring-white/1 p-0.5 bg-black/4 rounded-[8px]`}
              >
                <Button
                  href="https://app.lydie.co/auth"
                  size="lg"
                  intent="primary"
                >
                  <span>Start Lydie free</span>
                </Button>
              </div>
              <div className={styles.heroButton2}>
                <Button
                  href="https://github.com/lsalling/lydie"
                  size="lg"
                  target="_blank"
                  intent="ghost"
                  className="text-white hover:bg-white/10"
                >
                  <div className="flex items-center gap-x-1.5">
                    <span>Star on GitHub</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </Container>
        <div
          className={`relative z-10 bg-white/20 hidden rounded-[14px] -mb-40 p-2 md:flex flex-col before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:right-0 before:h-60 before:bg-linear-to-t before:from-black/40 before:via-black/20 before:to-transparent before:rounded-b-xl before:-z-10 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-xl after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay max-w-6xl mx-auto ${styles.heroImage}`}
          style={{
            boxShadow:
              "0 1px rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.15), 0 1px 1.5px 0 rgba(0,0,0,0.08), 0 0 1.5px 0 rgba(0,0,0,0.2), 0 0 40px rgba(255,255,255,0.09), 0 0 80px rgba(255,255,255,0.06), 0 0 120px rgba(255,255,255,0.03)",
          }}
        >
          <div
            className={`${styles.shimmerContainer} absolute inset-0 pointer-events-none`}
          ></div>
          <div className="flex items-center gap-x-1.5 mb-2 relative z-10">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="rounded-full size-[13px] bg-white/20"
                style={{
                  boxShadow:
                    "0 1px rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.15), 0 1px 1.5px 0 rgba(0,0,0,0.08), 0 0 1.5px 0 rgba(0,0,0,0.2), 0 0 40px rgba(255,255,255,0.09), 0 0 80px rgba(255,255,255,0.06), 0 0 120px rgba(255,255,255,0.03)",
                }}
              />
            ))}
            <div className={`relative group ${styles.demoButtonContainer}`}>
              <div className={styles.demoGlow}></div>
              <div className={styles.demoParticles}>
                <div className={styles.demoRotate}>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={styles.demoAngle}>
                      <div className={styles.demoSize}>
                        <div className={styles.demoPosition}>
                          <div className={styles.demoParticle} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleDemoClick}
                disabled={isLoading}
                className="rounded-full size-[13px] bg-green-300 hover:bg-green-200 transition-colors duration-100 cursor-pointer relative z-10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1, rotate: 360 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.2 },
                        rotate: {
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        },
                      }}
                      className="size-[8px] border-2 border-green-800 border-t-transparent rounded-full"
                    />
                  ) : (
                    <motion.svg
                      key="icon"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.2 }}
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      className="size-[11px] text-green-800 -rotate-45"
                    >
                      <path
                        fill="currentColor"
                        d="m18 9l-6-6l-6 6zm0 6l-6 6l-6-6z"
                      ></path>
                    </motion.svg>
                  )}
                </AnimatePresence>
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md shadow-lg whitespace-nowrap pointer-events-none z-50">
                {isLoading ? "Loading..." : "Click to demo!"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>

          <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10 relative overflow-hidden">
            <div className="rounded-lg overflow-hidden shadow-surface ring ring-black/8 relative z-10">
              <img src={imageSrc} alt={imageAlt} loading="eager" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
