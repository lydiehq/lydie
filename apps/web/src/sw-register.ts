// Registers the service worker (`sw.ts`) once the page has loaded and is idle. Only for the
// production web app on https: not in development or `vite preview` (http, where a worker would
// outlive the build it came from; `VITE_LYDIE_SW=1` builds register there too, for testing), not
// in the desktop app (its files are on disk) and not in a frame.
import { getInjectedPlatform } from "@lydie/platform";

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  if (window.location.protocol !== "https:" && import.meta.env.VITE_LYDIE_SW !== "1") return;
  if (getInjectedPlatform() || window.parent !== window) return;
  const base = import.meta.env.BASE_URL ?? "/";
  const register = () => {
    const idle =
      (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
      ((fn: () => void) => setTimeout(fn, 1000));
    idle(
      () => void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {}),
    );
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
