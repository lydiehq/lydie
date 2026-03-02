import { Container } from "../Container";
import { Button } from "../generic/Button";
import { GradientOutline } from "../generic/GradientOutline";
import { ComposableDemoNew } from "./ComposableDemoNew";

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
      <Container className="flex relative flex-col">
        <div className="flex justify-center text-center items-center md:items-start md:text-left size-full flex-col gap-y-4 py-24">
          {/* <div className="md:block hidden absolute right-0 bottom-0">
            <GradientOutline />
            <svg
              className="text-black/8 size-32"
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
          </div> */}
          <div className="flex flex-col gap-y-4 py-12">
            {/* <div className="relative flex items-center gap-x-1.5">
              <div className="size-8 rounded-md border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative bg-amber-300"></div>
              <div className="size-8 rounded-full border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative bg-blue-300"></div>
            </div> */}

            <h1 className="text-5xl font-medium tracking-tight text-black/85">
              <span className="inline-block">Centralize</span>{" "}
              <span className="inline-block">your</span>{" "}
              <span className="inline-block">writing</span>
            </h1>
            <p className="text-lg/relaxed text-black/70 text-balance">
              <span className="inline-block">
                Lydie is a cloud-based writing workspace that adapts to your needs.
              </span>
              <br />
              <span className="inline-block">
                An open-source alternative to Google Docs, Notion and others.
              </span>
            </p>
          </div>

          <div className="flex md:justify-start justify-center items-center gap-x-1.5 relative w-full">
            <div className="absolute -left-6 inset-y-0">
              <div className="rounded-full size-3 absolute -top-6 ring ring-outline-subtle"></div>
              <div className="rounded-full size-3 absolute -bottom-6 ring ring-outline-subtle"></div>
            </div>
            <GradientOutline />

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
      </Container>
      <div className="relative my-20">
        <div
          className="rounded-2xl p-8 border border-black/8 absolute inset-x-4 -inset-y-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15, 23, 42, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.02) 1px, transparent 1px), linear-gradient(to top left, #eff6ff, #faf5ff, #fff1f2)",
            backgroundSize: "22px 22px, 22px 22px, 100% 100%",
          }}
        >
          <GradientOutline />
        </div>

        <Container>
          <ComposableDemoNew
            activeState="collaboration"
            states={["collaboration", "linking", "assistant"]}
          />
        </Container>
      </div>
    </div>
  );
}
