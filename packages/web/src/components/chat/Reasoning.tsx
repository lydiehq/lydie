import { BrainSparkleFilled, ChevronDownRegular } from "@fluentui/react-icons";
import { clsx } from "clsx";
import { cva } from "cva";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import * as React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = React.useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

type ReasoningProps = {
  children: ReactNode;
  className?: string;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

const shimmerClass = cva({
  base: "relative overflow-hidden",
  variants: {
    isAnimating: {
      true: "",
    },
  },
});

function ShimmerText({ children, isAnimating }: { children: ReactNode; isAnimating?: boolean }) {
  if (!isAnimating) return <>{children}</>;

  return (
    <span className={shimmerClass({ isAnimating: true })}>
      <motion.span
        className="absolute inset-0 bg-linear-to-r from-transparent via-gray-200/50 to-transparent"
        animate={{
          x: ["-100%", "100%"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}

export const Reasoning = memo(function Reasoning({
  children,
  className,
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration: durationProp,
}: ReasoningProps) {
  const resolvedDefaultOpen = defaultOpen ?? isStreaming;
  const isExplicitlyClosed = defaultOpen === false;

  const [isOpen, setIsOpen] = useState(resolvedDefaultOpen);
  const [duration, setDuration] = useState<number | undefined>(durationProp);

  const hasEverStreamedRef = useRef(isStreaming);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  // Sync with controlled props
  useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open);
    }
  }, [open]);

  useEffect(() => {
    if (durationProp !== undefined) {
      setDuration(durationProp);
    }
  }, [durationProp]);

  // Track when streaming starts and compute duration
  useEffect(() => {
    if (isStreaming) {
      hasEverStreamedRef.current = true;
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    } else if (startTimeRef.current !== null) {
      setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
      startTimeRef.current = null;
    }
  }, [isStreaming, setDuration]);

  // Auto-open when streaming starts (unless explicitly closed)
  useEffect(() => {
    if (isStreaming && !isOpen && !isExplicitlyClosed && open === undefined) {
      setIsOpen(true);
    }
  }, [isStreaming, isOpen, isExplicitlyClosed, open]);

  // Auto-close when streaming ends (once only, and only if it ever streamed)
  useEffect(() => {
    if (
      hasEverStreamedRef.current &&
      !isStreaming &&
      isOpen &&
      !hasAutoClosed &&
      open === undefined
    ) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, hasAutoClosed, open]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setIsOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange],
  );

  const contextValue = useMemo(
    () => ({ duration, isOpen, isStreaming, setIsOpen: handleOpenChange }),
    [duration, isOpen, isStreaming, handleOpenChange],
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <div className={clsx("my-2", className)}>{children}</div>
    </ReasoningContext.Provider>
  );
});

type ReasoningTriggerProps = {
  children?: ReactNode;
  className?: string;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return (
      <ShimmerText isAnimating={isStreaming}>
        <span className="text-gray-500">Thinking...</span>
      </ShimmerText>
    );
  }
  if (duration === undefined) {
    return <span className="text-gray-500">Thought for a few seconds</span>;
  }
  return (
    <span className="text-gray-500">
      Thought for {duration} second{duration === 1 ? "" : "s"}
    </span>
  );
};

export const ReasoningTrigger = memo(function ReasoningTrigger({
  children,
  className,
  getThinkingMessage = defaultGetThinkingMessage,
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration, setIsOpen } = useReasoning();

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className={clsx(
        "flex w-full items-center gap-2 text-sm transition-colors hover:text-gray-900 py-1",
        className,
      )}
    >
      {children ?? (
        <>
          <BrainSparkleFilled className="size-4 text-gray-400" />
          <span className="flex-1 text-left">{getThinkingMessage(isStreaming, duration)}</span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDownRegular className="size-4 text-gray-400" />
          </motion.div>
        </>
      )}
    </button>
  );
});

type ReasoningContentProps = {
  children: string;
  className?: string;
};

export const ReasoningContent = memo(function ReasoningContent({
  children,
  className,
}: ReasoningContentProps) {
  const { isOpen } = useReasoning();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            className={clsx(
              "mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600 max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
              className,
            )}
          >
            <Streamdown>{children}</Streamdown>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// Helper component to consolidate reasoning parts from a message
export function ReasoningParts({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: { id: string; parts: any[] };
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  // Consolidate all reasoning parts into one block
  const reasoningParts = message.parts.filter((part) => part.type === "reasoning");
  const reasoningText = reasoningParts.map((part) => part.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;

  // Check if reasoning is still streaming (last part is reasoning on last message)
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming = isLastMessage && isStreaming && lastPart?.type === "reasoning";

  if (!hasReasoning) return null;

  return (
    <Reasoning isStreaming={isReasoningStreaming} className="w-full">
      <ReasoningTrigger />
      <ReasoningContent>{reasoningText}</ReasoningContent>
    </Reasoning>
  );
}
