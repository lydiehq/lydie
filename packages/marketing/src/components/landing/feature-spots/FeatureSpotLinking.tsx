import { motion } from "motion/react";

import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";

export function FeatureSpotLinking() {
  return (
    <CastShadow className="w-full">
      <GradientOutline />
      <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white relative w-full flex items-center justify-center p-6">
        {/* Main document card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-[220px] bg-white rounded-lg shadow-lg border border-gray-100 p-4"
        >
          {/* Content with link */}
          <div className="space-y-2">
            <div className="h-2 bg-gray-200 rounded-full w-3/4" />
            <div className="flex flex-wrap gap-1 items-center">
              <div className="h-1.5 bg-gray-100 rounded-full w-8" />
              {/* The linked text - highlighted in blue */}
              <motion.span
                initial={{ backgroundColor: "rgba(255,255,255,0)" }}
                animate={{ backgroundColor: "rgba(59, 130, 246, 0.15)" }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-blue-600 text-sm font-medium cursor-pointer group"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Project Plan
                {/* Popover tooltip */}
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.8, type: "spring", stiffness: 400, damping: 25 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10"
                >
                  <div className="bg-white rounded-lg shadow-xl border border-blue-100 p-2.5 min-w-[140px]">
                    {/* Gradient header */}
                    <div className="h-1 w-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full mb-2" />
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-blue-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">Project Plan</div>
                        <div className="text-[0.6rem] text-blue-500">Linked document</div>
                      </div>
                    </div>
                  </div>
                  {/* Arrow */}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-blue-100 rotate-45" />
                </motion.div>
              </motion.span>
              <div className="h-1.5 bg-gray-100 rounded-full w-6" />
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full w-full" />
            <div className="h-1.5 bg-gray-100 rounded-full w-5/6" />
          </div>
        </motion.div>

        {/* Decorative connection dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-4 right-4 w-2 h-2 rounded-full bg-blue-300"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="absolute top-4 left-4 w-1.5 h-1.5 rounded-full bg-blue-200"
        />
      </div>
    </CastShadow>
  );
}
