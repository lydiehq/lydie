import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { bootOnce } from "./boot.ts";
import { routeOf } from "./routes.ts";

export function mount(root: HTMLElement): void {
  // The workspace opens while React renders (and while the app lock, if any, answers): what is
  // shown waits for it, opening it does not wait for what is shown.
  if (routeOf(window.location.pathname) === "workspace") void bootOnce().catch(() => {});
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
