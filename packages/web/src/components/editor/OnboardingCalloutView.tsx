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
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    icon: "text-yellow-600",
    title: "text-yellow-900",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-600",
    title: "text-blue-900",
  },
  warning: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: "text-orange-600",
    title: "text-orange-900",
  },
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    icon: "text-green-600",
    title: "text-green-900",
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
      <div className={`rounded-lg ${styles.bg} ${styles.border} border p-4`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 ${styles.icon}`}>
            <Icon className="size-5" />
          </div>
          <div className="flex-1">
            {title && <h4 className={`font-semibold mb-1 ${styles.title}`}>{title}</h4>}
            <p className="text-sm text-gray-700">{content}</p>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
