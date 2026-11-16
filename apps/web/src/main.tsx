// The entry: as small as possible, so what can start before the app's code has loaded starts
// first (`early.ts`: the browser's database). The app is its own chunks, which index.html
// preloads (see vite-startup.ts).
import { databaseStarted, SEED, startEarly } from "./early.ts";
import { routeOf } from "./routes.ts";
import { rewriteStoredIds } from "./stored-ids.ts";
import { registerServiceWorker } from "./sw-register.ts";

import "./index.css";

rewriteStoredIds();
if (routeOf(window.location.pathname) === "workspace") startEarly({ benchmark: SEED === "large" });

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

void databaseStarted()
  .then(() => import("./mount.tsx"))
  .then(({ mount }) => mount(root));
registerServiceWorker();
