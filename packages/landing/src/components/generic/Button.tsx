import { cva, type VariantProps } from "cva";
import React from "react";
import {
  Button as RAButton,
  type ButtonProps as ReactAriaButtonProps,
  composeRenderProps,
} from "react-aria-components";
import { Loader } from "lucide-react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { twMerge } from "tailwind-merge";

const focusRing = cva({
  base: "outline outline-blue-600 outline-offset-2",
  variants: {
    isFocusVisible: {
      false: "outline-0",
      true: "outline-2",
    },
  },
});

function composeTailwindRenderProps<T>(
  className: string | ((v: T) => string) | undefined,
  tw: string
): string | ((v: T) => string) {
  return composeRenderProps(className, (className) => twMerge(tw, className));
}

const styles = cva({
  base: [
    "transition-colors duration-150 relative items-center isolate select-none inline-flex shrink-0 justify-center whitespace-nowrap font-medium no-underline rounded-[var(--button-radius)] disabled:opacity-50 disabled:cursor-not-allowed group",
  ].join(" "),
  variants: {
    intent: {
      primary: [
        "border border-black shadow-[0_1px_theme(colors.white/0.25)_inset,0_1px_3px_theme(colors.black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[var(--button-radius)] active:before:bg-white/0 hover:before:bg-white/6 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[var(--button-radius)] after:bg-gradient-to-b after:from-white/14 bg-gray-800 text-white after:mix-blend-overlay",
      ],
      secondary:
        "ring-1 ring-black/10 bg-white text-gray-700 hover:bg-black/5 border-black/20 shadow-sm disabled:bg-gray-100 disabled:text-gray-500",
      ghost: "bg-transparent text-gray-700 hover:bg-black/5 border-transparent",
      danger: "bg-red-600 text-white hover:bg-red-700 border-red-600",
    },
    size: {
      xs: "h-5 px-2 text-[0.6875rem] [--button-radius:theme(radius.md)]",
      sm: "h-6 px-2 text-xs [--button-radius:theme(radius.md)]",
      md: "h-7 px-2 text-[0.8125rem]/0 [--button-radius:theme(radius.md)]",
      lg: "h-8 px-4 py-1.5 text-sm/0 [--button-radius:theme(radius.md)]",
      xl: "h-11 px-8 text-sm [--button-radius:theme(radius.xl)]",
      icon: "h-10 w-10 text-sm",
    },
  },
  defaultVariants: {
    intent: "primary",
    size: "md",
  },
});

type ButtonElementProps = ReactAriaButtonProps & {
  href?: undefined;
} & VariantProps<typeof styles>;

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  isPending?: boolean;
} & VariantProps<typeof styles>;

export type ButtonProps = ButtonElementProps | AnchorProps;

const isAnchor = (props: ButtonProps): props is AnchorProps => {
  return props.href != undefined;
};

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>((props, ref) => {
  if (isAnchor(props)) {
    const { className, children, ...rest } = props;
    return (
      <a
        {...rest}
        className={twMerge(
          focusRing({ isFocusVisible: false }),
          styles({
            intent: props.intent,
            size: props.size,
            className,
          })
        )}
        ref={ref as React.Ref<HTMLAnchorElement>}
      >
        <ButtonChildren
          children={children}
          isPending={props.isPending}
          size={props.size}
        />
      </a>
    );
  }

  const { className, children, ...rest } = props;

  return (
    <RAButton
      {...rest}
      ref={ref as any}
      className={composeTailwindRenderProps(
        focusRing,
        styles({
          className,
          intent: props.intent,
          size: props.size,
        })
      )}
    >
      <ButtonChildren
        children={children as React.ReactNode}
        isPending={props.isPending}
        size={props.size}
      />
    </RAButton>
  );
});

Button.displayName = "Button";

function ButtonChildren({
  children,
  isPending,
  size = "md",
}: {
  children: React.ReactNode;
  isPending?: boolean;
  size?: VariantProps<typeof styles>["size"];
}) {
  const showSpinner = isPending;

  // Map button sizes to loader sizes
  const getLoaderSize = (buttonSize?: VariantProps<typeof styles>["size"]) => {
    switch (buttonSize) {
      case "xs":
        return { pixels: 12, className: "size-3" }; // 0.75rem = 12px
      case "sm":
        return { pixels: 14, className: "size-[14px]" }; // 0.875rem = 14px
      case "md":
        return { pixels: 16, className: "size-4" }; // 1rem = 16px
      case "lg":
        return { pixels: 18, className: "size-[18px]" }; // 1.125rem = 18px
      case "xl":
        return { pixels: 20, className: "size-5" }; // 1.25rem = 20px
      case "icon":
        return { pixels: 18, className: "size-[18px]" }; // 1.125rem = 18px
      default:
        return { pixels: 16, className: "size-4" }; // default to md
    }
  };

  const loaderSize = getLoaderSize(size);
  const spinnerSize = loaderSize.pixels;
  const gapSize = 4; // gap-2 = 0.5rem = 8px
  const totalWidth = spinnerSize + gapSize;

  return (
    <div className={clsx("flex items-center")} role="presentation">
      <AnimatePresence mode="wait">
        {showSpinner && (
          <motion.div
            key="spinner"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: totalWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="shrink-0 overflow-hidden flex items-center"
            style={{ minWidth: 0 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
              className="shrink-0"
              style={{ width: spinnerSize, height: spinnerSize }}
            >
              <Loader className={clsx(loaderSize.className, "text-gray-500")} />
            </motion.div>
            <div style={{ width: gapSize }} className="shrink-0" />
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
