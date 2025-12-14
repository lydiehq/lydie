import { motion } from "motion/react";

type AnimatedWordProps = {
  children: string;
};

export const AnimatedWord = ({ children }: AnimatedWordProps) => (
  <motion.span
    variants={{
      hidden: { opacity: 0, x: -20, filter: "blur(10px)" },
      visible: {
        opacity: 1,
        x: 0,
        filter: "blur(0px)",
        transition: { type: "spring", duration: 1.6 },
      },
    }}
    className="inline-block"
  >
    {children}
  </motion.span>
);
