// Preloaded by `bun test` (see bunfig.toml): a happy-dom window for the React binding tests.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Tells React that tests wrap updates in act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
