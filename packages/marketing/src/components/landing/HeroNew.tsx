import { motion } from "motion/react";

import { Container } from "../Container";
import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import styles from "./Hero.module.css";

type Props = {
  imageSrc: string;
  imageSrcSet?: string;
  imageSizes?: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
};

export function HeroNew({
  imageSrc,
  imageSrcSet,
  imageSizes,
  imageAlt,
  imageWidth,
  imageHeight,
}: Props) {
  return (
    // <div className="mask-b-from-75% mask-b-to-95%">
    <div>
      <Container className="flex relative flex-col md:flex-row md:h-[840px] py-8 md:py-0">
        <div className="flex justify-center text-center items-center md:items-start md:text-left size-full flex-col md:max-w-[350px] gap-y-4 md:-mt-20 ">
          <div className="relative self-start md:block hidden">
            <GradientOutline />
            <svg
              className="text-black/8 size-16"
              viewBox="0 0 66 66"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <motion.path
                d="M62.6055 37.8027C63.113 37.3222 63.7956 37.2773 64.3154 37.5332C64.8423 37.7928 65.2155 38.3718 65.0811 39.0811C62.2266 54.1245 48.9823 65.5 33.0752 65.5C25.254 65.4999 18.0753 62.7493 12.46 58.165C11.9237 57.7273 11.8187 57.0716 12.0264 56.54C12.2319 56.014 12.7454 55.599 13.4199 55.5957C22.3695 55.5518 32.4799 54.1717 42.1797 50.4648C49.468 47.6795 56.5056 43.5787 62.6055 37.8027ZM33.0752 0.5C46.408 0.5 57.8697 8.49184 62.9111 19.9346C63.1096 20.3852 63.067 20.904 62.8057 21.3164C56.5462 31.1914 47.7702 37.2196 38.458 40.7783C26.274 45.4345 13.099 45.8556 3.50195 44.6436C2.94827 44.5736 2.48043 44.1989 2.2959 43.6689C1.13206 40.3264 0.5 36.7363 0.5 33C0.500001 15.0497 15.0855 0.50012 33.0752 0.5Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 4, ease: "easeOut" }}
              />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-black/85">
            <span className={styles.heroWord1}>Centralize</span>{" "}
            <span className={styles.heroWord2}>your</span>{" "}
            <span className={styles.heroWord3}>writing</span>
          </h1>
          <p className="text-base/relaxed text-black/60 max-w-md text-balance drop-shadow-text">
            <span className={styles.heroSentence1}>
              Lydie is a cloud-based writing workspace that adapts to your needs.
            </span>
            <br />
            <span className={styles.heroSentence2}>
              An open-source alternative to Google Docs, Notion and others.
            </span>
          </p>
          <div className="flex md:justify-start justify-center items-center gap-x-1.5 mt-4 relative w-full">
            {/* <GradientOutline /> */}
            <Button
              href="https://app.lydie.co/auth"
              size="lg"
              intent="primary"
              phCapture="hero_cta_clicked"
            >
              <span>Start writing for free</span>
            </Button>
            <Button
              href="https://github.com/lydiehq/lydie"
              size="lg"
              target="_blank"
              intent="ghost"
              phCapture="github_clicked"
            >
              <div className="flex items-center gap-x-1.5">
                <span>Star on GitHub</span>
              </div>
            </Button>
          </div>
        </div>
        <div className="md:absolute top-12 left-[400px] mt-12 md:mt-0">
          <div className="rounded-2xl top-12 ring ring-outline-subtle flex flex-col w-full p-0 left-1/2 md:p-2">
            <GradientOutline />
            <div className="md:flex items-center gap-x-1.5 mb-1.5 hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-full size-3 ring ring-black/6 shrink-0" />
              ))}
            </div>
            <div className="flex gap-x-2">
              <CastShadow className="w-full rounded-b-xl rounded-t-lg">
                <div className="flex flex-1 w-[160%] md:h-[720px] aspect-874/606 rounded-b-xl rounded-t-lg overflow-hidden bg-white shadow-xl ring ring-black/8 relative max-w-5xl ">
                  <img
                    src={imageSrc}
                    srcSet={imageSrcSet}
                    sizes={imageSizes}
                    alt={imageAlt}
                    width={imageWidth}
                    height={imageHeight}
                    loading="eager"
                    decoding="async"
                    className="w-full h-auto"
                  />
                </div>
              </CastShadow>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
