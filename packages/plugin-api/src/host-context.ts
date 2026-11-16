// The contexts the host's values travel in. Internal to this package: plugins reach them through
// the hooks in `react.tsx` and `<ContributionBoundary>`.
import { createContext } from "react";

import type { AppApi } from "./plugin.ts";
import type { HostBridge } from "./react.tsx";

export const HostContext = createContext<HostBridge | null>(null);

// The app of the plugin whose contribution renders below (`<ContributionBoundary>`); null outside
// any, where `useApp()` is the host's own.
export const ScopeContext = createContext<AppApi | null>(null);
