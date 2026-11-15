/* oxlint-disable jsx-a11y/prefer-tag-over-role -- live regions on <div>/<span>: <output> is for form results */
import clsx from "clsx";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { RollingMark } from "../identity/RollingMark";

// Presentational UI states, shared by the host and plugins. Text and actions come from the caller.

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** A drawing from `illustrations/`, above the title; instead of `icon`. */
  illustration?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  illustration,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      {illustration && <div className="mb-3">{illustration}</div>}
      {icon && <div className="text-gray-400">{icon}</div>}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-gray-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      // Hidden for the first 150 ms, like Skeleton: a load that finishes at once shows nothing.
      className={twMerge(
        "flex animate-appear items-center justify-center gap-2 px-6 py-6 text-xs text-gray-500",
        className,
      )}
    >
      <RollingMark size={14} className="text-gray-400" />
      <span>{label}</span>
    </div>
  );
}

// One bar of a skeleton: `className` gives it its size (`h-3 w-24`). Compose these into the shape
// of what is loading, inside something that announces the loading (`role="status"`, `aria-busy`).
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("block animate-skeleton rounded bg-gray-950/[0.07]", className)}
    />
  );
}

type ErrorStateProps = {
  title?: string;
  error?: unknown;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  error,
  action,
  className,
}: ErrorStateProps) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error
          ? JSON.stringify(error)
          : null;
  return (
    <div
      role="alert"
      className={clsx(
        "flex flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-red-700">{title}</p>
      {message && <p className="max-w-md text-xs break-words text-gray-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export type BannerKind = "info" | "offline" | "syncing" | "conflict" | "error" | "warning";

const BANNER_STYLES: Record<BannerKind, string> = {
  info: "bg-blue-50 text-blue-900 border-blue-100",
  offline: "bg-gray-100 text-gray-700 border-gray-950/8",
  syncing: "bg-gray-50 text-gray-700 border-gray-950/8",
  conflict: "bg-amber-50 text-amber-900 border-amber-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  error: "bg-red-50 text-red-900 border-red-200",
};

export function StatusBanner({
  kind,
  children,
  action,
  variant = "bar",
  className,
}: {
  kind: BannerKind;
  children: ReactNode;
  action?: ReactNode;
  // `bar` spans the top of a view, ruled off below; `card` sits inside content, boxed and rounded.
  variant?: "bar" | "card";
  className?: string;
}) {
  return (
    <div
      role={kind === "error" || kind === "conflict" ? "alert" : "status"}
      className={clsx(
        "flex items-center gap-3 px-3 py-1.5 text-xs",
        variant === "card" ? "rounded-lg border" : "border-b",
        BANNER_STYLES[kind],
        className,
      )}
    >
      <div className="min-w-0 grow">{children}</div>
      {action}
    </div>
  );
}

export type SyncIndicatorState =
  | "local-only"
  | "signed-out"
  | "auth-expired"
  | "offline"
  | "connecting"
  | "syncing"
  | "synced"
  | "error";

const DOT: Record<SyncIndicatorState, string> = {
  "local-only": "bg-gray-300",
  "signed-out": "bg-amber-400",
  "auth-expired": "bg-amber-500",
  offline: "bg-gray-400",
  connecting: "bg-amber-400 animate-pulse",
  syncing: "bg-blue-400 animate-pulse",
  synced: "bg-green-500",
  error: "bg-red-500",
};

const LABEL: Record<SyncIndicatorState, string> = {
  "local-only": "On this device",
  "signed-out": "Signed out",
  "auth-expired": "Sign in again to sync",
  offline: "Offline",
  connecting: "Connecting",
  syncing: "Syncing",
  synced: "Synced",
  error: "Sync error",
};

// A dot and a short label for the sync state; pending and conflict counts when non-zero.
export function SyncIndicator({
  state,
  pending = 0,
  conflicts = 0,
  rejected = 0,
  className,
}: {
  state: SyncIndicatorState;
  pending?: number;
  conflicts?: number;
  rejected?: number;
  className?: string;
}) {
  const parts = [LABEL[state]];
  if (pending > 0) parts.push(`${pending} pending`);
  if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts === 1 ? "" : "s"}`);
  if (rejected > 0) parts.push(`${rejected} not saved`);
  const label = parts.join(" · ");
  return (
    <span
      role="status"
      aria-label={`Sync status: ${label}`}
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-gray-500",
        className,
      )}
    >
      <span className={clsx("size-1.5 rounded-full", DOT[state])} />
      <span>{label}</span>
    </span>
  );
}
