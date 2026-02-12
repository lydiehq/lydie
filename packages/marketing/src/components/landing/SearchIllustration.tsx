import { motion } from "motion/react";

import {
  CommandMenuIllustration,
  type CommandMenuIllustrationProps,
} from "./CommandMenuIllustration";

export interface SearchIllustrationProps extends CommandMenuIllustrationProps {
  backdrop?: boolean;
}

export function SearchIllustration({
  backdrop = true,
  className = "",
  ...props
}: SearchIllustrationProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`absolute inset-0 z-30 flex items-start justify-center pt-16 px-4 ${className}`}
    >
      {/* Backdrop */}
      {backdrop && <div className="absolute inset-0 bg-white/25 backdrop-blur-[1px]" />}

      {/* Command Menu */}
      <div className="relative w-full max-w-xl">
        <CommandMenuIllustration {...props} />
      </div>
    </motion.div>
  );
}
