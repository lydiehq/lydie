import { AnimatePresence, motion } from "motion/react"
import { Button as RACButton } from "react-aria-components"
import { DismissRegular, ErrorCircleRegular, SparkleRegular, FlashRegular } from "@fluentui/react-icons"
import { useRouter } from "@tanstack/react-router"
import { useOrganization } from "@/context/organization.context"
import clsx from "clsx"

export interface ChatAlertState {
  show: boolean
  type: "error" | "warning" | "info"
  title: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

interface ChatAlertProps {
  alert: ChatAlertState | null
  onDismiss: () => void
}

export function ChatAlert({ alert, onDismiss }: ChatAlertProps) {
  if (!alert || !alert.show) return null

  return (
    <AnimatePresence>
      <motion.div
        className="mb-2"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.175, 0.885, 0.32, 1.1],
        }}
      >
        <Container type={alert.type}>
          <div className="flex justify-between items-start p-2 border-b border-black/5">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {alert.type === "error" && <ErrorCircleRegular className="size-4 text-red-500 shrink-0" />}
              {alert.type === "warning" && <FlashRegular className="size-4 text-amber-500 shrink-0" />}
              {alert.type === "info" && <SparkleRegular className="size-4 text-blue-500 shrink-0" />}
              <span
                className={clsx(
                  "text-sm font-medium truncate",
                  alert.type === "error" && "text-red-700",
                  alert.type === "warning" && "text-amber-700",
                  alert.type === "info" && "text-blue-700",
                )}
              >
                {alert.title}
              </span>
            </div>
            <RACButton onPress={onDismiss} className="text-gray-500 hover:text-gray-700 ml-2">
              <DismissRegular className="size-4" />
            </RACButton>
          </div>
          <div className="p-2">
            <p
              className={clsx(
                "text-sm leading-relaxed",
                alert.type === "error" && "text-red-600",
                alert.type === "warning" && "text-amber-600",
                alert.type === "info" && "text-blue-600",
              )}
            >
              {alert.message}
            </p>
            {alert.action && (
              <div className="mt-3">
                <RACButton
                  onPress={alert.action.onClick}
                  className={clsx(
                    "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    alert.type === "error" && "bg-red-600 text-white hover:bg-red-700",
                    alert.type === "warning" && "bg-amber-600 text-white hover:bg-amber-700",
                    alert.type === "info" && "bg-blue-600 text-white hover:bg-blue-700",
                  )}
                >
                  {alert.action.label}
                </RACButton>
              </div>
            )}
          </div>
        </Container>
      </motion.div>
    </AnimatePresence>
  )
}

function Container({ children, type }: { children: React.ReactNode; type: "error" | "warning" | "info" }) {
  return (
    <motion.div
      className={clsx(
        "rounded-t-lg rounded-b-md bg-white ring ring-black/10 shadow-sm text-sm outline-none",
        type === "error" && "bg-red-50",
        type === "warning" && "bg-amber-50",
        type === "info" && "bg-blue-50",
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{
        duration: 0.3,
        delay: 0.1,
        ease: [0.175, 0.885, 0.32, 1.1],
      }}
    >
      {children}
    </motion.div>
  )
}
