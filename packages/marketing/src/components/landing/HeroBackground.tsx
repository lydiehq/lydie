import "../../styles/grainy-gradient.css";
import styles from "./Hero.module.css";

interface HeroBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function HeroBackground({ children, className = "" }: HeroBackgroundProps) {
  return (
    <div
      className={`grainy-gradient-container border border-black/10 custom-inner-shadow relative ${className}`}
    >
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
      <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" className={styles.embossedLogo}>
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M41.27 222.049c-.67-.618-.218-1.727.695-1.712 37.82.621 81.574-4.599 123.467-20.608 31.858-12.175 62.564-30.604 88.556-57.154.664-.679 1.812-.141 1.699.802C248.073 206.82 193.944 256 128.302 256c-33.588 0-64.162-12.876-87.032-33.951ZM8.475 172.36a.985.985 0 0 1-.797-.643C2.71 158.076 0 143.354 0 128 0 57.308 57.443 0 128.302 0c53.062 0 98.601 32.136 118.129 77.965a.999.999 0 0 1-.072.916c-24.815 39.85-59.9 64.094-97.239 78.364-49.113 18.769-102.352 20.214-140.645 15.115Z"
          clipRule="evenodd"
        ></path>
      </svg>
      {children}
    </div>
  );
}
