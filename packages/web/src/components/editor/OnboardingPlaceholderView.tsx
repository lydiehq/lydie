import { motion } from "motion/react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function OnboardingPlaceholderView({ node }: NodeViewProps) {
  const title = node.attrs.title || "Coming Soon";
  const description = node.attrs.description || "This onboarding step will be available soon.";

  return (
    <NodeViewWrapper>
      <motion.div className="p-1 bg-gray-100 rounded-[10px] my-4 relative">
        <div className="p-1">
          <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
            <span>Coming soon</span>
          </motion.div>
        </div>
        <div className="relative">
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: -1.5 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
            className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden absolute h-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[calc(100%-1rem)] z-0 opacity-80"
          />
          <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative z-10">
            <div className="p-2">
              <span className="text-xs font-semibold text-gray-900">{title}</span>
              <p className="text-xs text-gray-600 mt-1">{description}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </NodeViewWrapper>
  );
}
