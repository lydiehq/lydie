import { motion } from "motion/react";

export function FeatureSpotSearch() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[240px] rounded-lg bg-white shadow-lg border border-gray-100 overflow-hidden"
      >
        {/* Input */}
        <div className="flex items-center px-3 py-2.5 border-b border-gray-50">
          <svg
            className="w-4 h-4 text-gray-400 mr-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "60%" }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="h-full bg-gray-300 rounded-full"
            />
          </div>
        </div>

        {/* Results */}
        <div className="p-1.5 space-y-0.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                i === 0 ? "bg-gray-100" : ""
              }`}
            >
              <div className="w-3.5 h-3.5 rounded bg-gray-200" />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 bg-gray-200 rounded-full w-3/4" />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Sparkle decoration */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 500 }}
        className="absolute top-4 right-4 w-6 h-6 text-blue-400"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L13.09 8.26L19 7L14.74 11.27L21 14L14.74 14.74L17 21L12 16.09L7 21L9.26 14.74L3 14L9.26 11.27L5 7L10.91 8.26L12 2Z" />
        </svg>
      </motion.div>
    </div>
  );
}
