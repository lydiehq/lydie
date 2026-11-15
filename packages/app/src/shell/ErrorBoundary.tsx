import { Button, ErrorState } from "@lydie/ui";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  // Who rendered the content, e.g. "plugin document-tree (sidebar)".
  label: string;
  children: ReactNode;
  // Changing it resets the boundary (e.g. the tab route).
  resetKey?: unknown;
  compact?: boolean;
};

type State = { error: Error | null; resetKey: unknown };

// Wraps every plugin contribution so one failing view or panel cannot take the app down.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorState
        className={this.props.compact ? "py-3" : undefined}
        title={`${this.props.label} failed`}
        error={this.state.error}
        action={
          <Button size="sm" variant="secondary" onPress={() => this.setState({ error: null })}>
            Try again
          </Button>
        }
      />
    );
  }
}
