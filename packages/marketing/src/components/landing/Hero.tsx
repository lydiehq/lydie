import { Container } from "../Container";
import { Button } from "../generic/Button";
import styles from "./Hero.module.css";
import { HeroBackground } from "./HeroBackground";

type Props = {
  imageSrc: string;
  imageSrcSet?: string;
  imageSizes?: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
};

export function Hero({
  imageSrc,
  imageSrcSet,
  imageSizes,
  imageAlt,
  imageWidth,
  imageHeight,
}: Props) {
  return (
    <div className="md:px-4">
      <HeroBackground className="md:rounded-xl md:ring md:ring-black/20 relative md:px-4">
        <Container className="flex flex-col relative z-20 pb-20 md:pb-16 md:pt-28 pt-20">
          <div className="flex flex-col gap-y-3 max-w-2xl text-center mx-auto">
            <div
              className={`mb-4 rounded-full bg-white/15 self-center px-2.5 py-[3px] flex items-center gap-x-1.5 ${styles.heroBadge}`}
              style={{
                boxShadow:
                  "0 1px rgba(255,255,255,0.2) inset, 0 1px 3px rgba(0,0,0,0.1), 0 1px 1.5px 0 rgba(0,0,0,0.05), 0 0 1.5px 0 rgba(0,0,0,0.1), 0 0 40px rgba(255,255,255,0.05), 0 0 80px rgba(255,255,255,0.02), 0 0 120px rgba(255,255,255,0.02)",
              }}
            >
              <span className="text-[12px] font-medium text-white">Now in open beta!</span>
            </div>
            <h1 className="text-5xl font-medium tracking-tight text-white drop-shadow-text">
              <span className={styles.heroWord1}>Centralize</span>{" "}
              <span className={styles.heroWord2}>your</span>{" "}
              <span className={styles.heroWord3}>writing</span>
            </h1>
            <p className="text-[17px]/relaxed text-white/90 text-balance">
              <span className={styles.heroSentence1}>
                Lydie is a cloud-based writing workspace that adapts to your needs.
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
                  phCapture="hero_cta_clicked"
                >
                  <span>Start writing for free</span>
                </Button>
              </div>
              <div className={styles.heroButton2}>
                <Button
                  href="https://github.com/lydiehq/lydie"
                  size="lg"
                  target="_blank"
                  intent="ghost"
                  className="text-white hover:bg-white/10"
                  phCapture="github_clicked"
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
          className={`relative z-10 bg-white/20 hidden rounded-[14px] -mb-64 p-2 md:flex flex-col before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:right-0 before:h-60 before:rounded-b-xl before:-z-10 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-xl after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay max-w-5xl mx-auto ${styles.heroImage}`}
          style={{
            boxShadow:
              "0 1px rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.15), 0 1px 1.5px 0 rgba(0,0,0,0.08), 0 0 1.5px 0 rgba(0,0,0,0.2), 0 0 40px rgba(255,255,255,0.09), 0 0 80px rgba(255,255,255,0.06), 0 0 120px rgba(255,255,255,0.03)",
          }}
        >
          <div className="flex items-center gap-x-1.5 mb-2 relative z-10">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-full size-[13px] bg-white/20"
                style={{
                  boxShadow:
                    "0 1px rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.15), 0 1px 1.5px 0 rgba(0,0,0,0.08), 0 0 1.5px 0 rgba(0,0,0,0.2), 0 0 40px rgba(255,255,255,0.09), 0 0 80px rgba(255,255,255,0.06), 0 0 120px rgba(255,255,255,0.03)",
                }}
              />
            ))}
            {/* <DemoButton /> */}
          </div>

          <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10 relative overflow-hidden">
            <div className="rounded-lg overflow-hidden shadow-surface ring ring-black/8 relative z-10">
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
          </div>
        </div>
      </HeroBackground>
    </div>
  );
}
