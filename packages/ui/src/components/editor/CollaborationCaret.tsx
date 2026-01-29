import { cva, type VariantProps } from "cva";
import * as React from "react";

export const collaborationCaretStyles = cva({
  base: ["border-l border-r -ml-px -mr-px", "pointer-events-none relative", "break-normal"],
});

export const collaborationLabelStyles = cva({
  base: [
    "rounded-[3px] rounded-bl-none",
    "text-[12px] font-semibold leading-normal",
    "absolute left-[-1px] top-[-1.4em]",
    "px-[0.3rem] py-[0.1rem]",
    "select-none whitespace-nowrap",
    "text-[#0d0d0d] dark:text-white",
  ],
});

export interface CollaborationCaretProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof collaborationCaretStyles> {
  userName: string;
  userColor: string;
}

export const CollaborationCaret = React.forwardRef<HTMLSpanElement, CollaborationCaretProps>(
  ({ userName, userColor, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={collaborationCaretStyles({ className })}
        style={{ borderColor: userColor, color: userColor }}
        {...props}
      >
        <span className={collaborationLabelStyles()} style={{ backgroundColor: userColor }}>
          {userName}
        </span>
      </span>
    );
  },
);

CollaborationCaret.displayName = "CollaborationCaret";

export const renderCollaborationCaret = (user: {
  name: string;
  color: string;
  typing?: boolean;
}) => {
  // Main caret element
  const cursor = document.createElement("span");
  cursor.classList.add(
    "border-l",
    "border-r",
    "-ml-px",
    "-mr-px",
    "pointer-events-none",
    "relative",
    "break-normal",
  );
  cursor.style.borderColor = user.color;

  // Add pulsing animation if typing
  if (user.typing) {
    cursor.style.animation = "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite";
  }

  // Label element
  const label = document.createElement("div");
  label.classList.add(
    "rounded-[3px]",
    "rounded-bl-none",
    "text-[12px]",
    "font-semibold",
    "leading-normal",
    "absolute",
    "left-[-1px]",
    "top-[-1.4em]",
    "px-[0.3rem]",
    "py-[0.1rem]",
    "select-none",
    "whitespace-nowrap",
    "text-[#0d0d0d]",
    "dark:text-white",
  );
  label.style.backgroundColor = user.color;

  // Add typing indicator to label
  if (user.typing) {
    const typingIndicator = document.createElement("span");
    typingIndicator.textContent = "...";
    typingIndicator.style.animation = "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite";
    label.textContent = `${user.name} `;
    label.appendChild(typingIndicator);
  } else {
    label.textContent = user.name;
  }

  // Append label to cursor
  cursor.appendChild(label);

  return cursor;
};

export const renderCollaborationSelection = (user: { name: string; color: string }) => {
  const selection = document.createElement("span");
  selection.classList.add("absolute", "pointer-events-none");
  selection.style.backgroundColor = `${user.color}33`; // 20% opacity
  return selection;
};

// Hook to generate consistent user colors based on user ID.
export function useUserColor(userId: string): string {
  return React.useMemo(() => {
    const colors = [
      "#30bced",
      "#6eeb83",
      "#ffbc42",
      "#ecd444",
      "#ee6352",
      "#9ac2c9",
      "#8acb88",
      "#1be7ff",
      "#ff006e",
      "#8338ec",
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [userId]);
}
