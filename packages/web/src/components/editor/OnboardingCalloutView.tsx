import { motion } from "motion/react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  LightbulbRegular,
  InfoRegular,
  WarningRegular,
  CheckmarkCircleRegular,
} from "@fluentui/react-icons"

const iconMap = {
  lightbulb: LightbulbRegular,
  info: InfoRegular,
  warning: WarningRegular,
  checkmark: CheckmarkCircleRegular,
}

const typeStyles = {
  tip: {
    icon: "text-yellow-600",
    label: "💡 Tip",
  },
  info: {
    icon: "text-blue-600",
    label: "ℹ️ Info",
  },
  warning: {
    icon: "text-orange-600",
    label: "⚠️ Warning",
  },
  success: {
    icon: "text-green-600",
    label: "✓ Success",
  },
}

export function OnboardingCalloutView({ node }: NodeViewProps) {
  const type = (node.attrs.type || "tip") as keyof typeof typeStyles
  const iconName = (node.attrs.icon || "lightbulb") as keyof typeof iconMap
  const title = node.attrs.title || ""
  const content = node.attrs.content || ""

  const Icon = iconMap[iconName] || LightbulbRegular
  const styles = typeStyles[type] || typeStyles.tip

  return (
    <NodeViewWrapper className="my-4">
      <motion.div className="p-1 bg-gray-100 rounded-[10px] relative">
        <div className="p-1">
          <motion.div className="text-[11px] text-gray-700 flex items-center gap-1.5">
            <span>{styles.label}</span>
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
              <div className="flex items-start gap-2">
                <div className={`shrink-0 ${styles.icon}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1">
                  {title && <h4 className="font-semibold mb-1 text-xs text-gray-900">{title}</h4>}
                  <p className="text-xs text-gray-700">{content}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </NodeViewWrapper>
  )
}
