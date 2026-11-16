// Where a plugin's contribution renders: `useApp()` below is that plugin's app, and a crash stays
// inside, so one failing view, panel or slot cannot take the rest of the app down. The host and
// every plugin that renders other plugins' components (document slots, settings pages, link
// renderers) put each one in its own.
import { Button, ErrorState } from "@lydie/ui";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { HostContext, ScopeContext } from "./host-context.ts";
import type { HostBridge } from "./react.tsx";

type Props = {
  // The plugin that contributed what renders inside (`Contributed.pluginId`).
  pluginId: string;
  // What it is, for the message and the console: "View", "Sidebar", "Settings page".
  label?: string;
  compact?: boolean;
  // Changing it clears a crash (e.g. the tab's page).
  resetKey?: unknown;
  // Shown instead of the error state after a crash; a function gets the error and a retry.
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  children: ReactNode;
};

type State = { error: Error | null; resetKey: unknown };

export class ContributionBoundary extends Component<Props, State> {
  static override contextType = HostContext;
  declare context: HostBridge | null;
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${this.name()}]`, error, info.componentStack);
  }

  private name() {
    return `${this.props.label ?? "Plugin"} (${this.props.pluginId})`;
  }

  private retry = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    const { fallback, compact } = this.props;
    let content: ReactNode = this.props.children;
    if (error) {
      content =
        fallback === undefined ? (
          <ContributionError
            name={this.name()}
            error={error}
            retry={this.retry}
            compact={compact}
          />
        ) : typeof fallback === "function" ? (
          fallback(error, this.retry)
        ) : (
          fallback
        );
    }
    // The app is looked up once per plugin by the host, so this value never changes identity.
    const app = this.context?.appFor?.(this.props.pluginId);
    return app ? <ScopeContext value={app}>{content}</ScopeContext> : content;
  }
}

// What a crashed contribution leaves: what failed, the error and "Try again".
export function ContributionError({
  name,
  error,
  retry,
  compact,
}: {
  name: string;
  error: Error;
  retry: () => void;
  compact?: boolean | undefined;
}) {
  return (
    <ErrorState
      className={compact ? "py-3" : undefined}
      title={`${name} failed`}
      error={error}
      action={
        <Button size="sm" variant="secondary" onPress={retry}>
          Try again
        </Button>
      }
    />
  );
}
