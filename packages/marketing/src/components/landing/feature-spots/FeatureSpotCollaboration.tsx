import { getColorById } from "@lydie/core/colors";
import { motion } from "motion/react";

import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";

const collaborators = [
  { name: "Sarah", color: getColorById("cyan")?.value ?? "#7DBCD6" },
  { name: "Alex", color: getColorById("green")?.value ?? "#90C9AA" },
  { name: "Jordan", color: getColorById("gold")?.value ?? "#E8B974" },
];

export function FeatureSpotCollaboration() {
  return (
    <div
      role="img"
      aria-label="Collaboration interface illustration showing multiple users editing a document together with live cursors"
    >
      <CastShadow className="w-full">
        <GradientOutline />
        <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white relative w-full flex items-center justify-center p-6">
          {/* Document card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="relative w-full max-w-[200px] bg-white rounded-lg shadow-lg border border-gray-100 p-4"
          >
            {/* Header with avatars */}
            <div className="flex items-center justify-between mb-3">
              <div className="h-2 w-16 bg-gray-200 rounded-full" />
              <div className="flex -space-x-1.5">
                {collaborators.map((c, i) => (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, scale: 0, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    transition={{
                      delay: 0.2 + i * 0.1,
                      type: "spring",
                      stiffness: 400,
                      damping: 20,
                    }}
                    className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[0.5rem] font-semibold text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.name[0]}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Content lines */}
            <div className="space-y-1.5">
              <div className="h-1.5 bg-gray-100 rounded-full w-full" />
              <div className="h-1.5 bg-gray-100 rounded-full w-5/6" />
              <div className="h-1.5 bg-gray-100 rounded-full w-4/6" />
            </div>

            {/* Animated cursor */}
            <motion.div
              initial={{ opacity: 0, x: 20, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="absolute bottom-4 right-4"
            >
              <div className="relative" style={{ color: collaborators[1].color }}>
                {/* Cursor */}
                <svg
                  width="14"
                  height="18"
                  viewBox="0 0 14 18"
                  fill="currentColor"
                  className="drop-shadow-sm"
                >
                  <path d="M2.5 2L2.5 13.5C2.5 14.0523 2.94772 14.5 3.5 14.5H5.5C6.05228 14.5 6.5 14.0523 6.5 13.5V10.5H10.5C11.0523 10.5 11.5 10.0523 11.5 9.5V2C11.5 1.44772 11.0523 1 10.5 1H3.5C2.94772 1 2.5 1.44772 2.5 2Z" />
                </svg>
                {/* Label */}
                <div
                  className="absolute -top-4 left-2 px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-white whitespace-nowrap"
                  style={{ backgroundColor: collaborators[1].color }}
                >
                  Alex
                </div>
              </div>
            </motion.div>

            {/* Highlight animation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{
                delay: 0.7,
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
              }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-100 to-transparent rounded-lg pointer-events-none"
            />
          </motion.div>

          {/* Connection lines decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.2 }}
            transition={{ delay: 0.8 }}
            className="absolute inset-0 pointer-events-none"
          >
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <motion.path
                d="M20 80 Q 50 20, 80 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeDasharray="2 2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1, duration: 1.5 }}
                className="text-gray-400"
              />
            </svg>
          </motion.div>
        </div>
      </CastShadow>
    </div>
  );
}
