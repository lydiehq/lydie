// Preloaded by `bun test` (see bunfig.toml): a happy-dom window for the React binding tests.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { MotionGlobalConfig } from "motion";

GlobalRegistrator.register();

// Tells React that tests wrap updates in act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The illustrations animate in. happy-dom leaves a cancelled animation's `finished` rejection
// unhandled (browsers mark it handled), which fails a test that unmounts one mid-way.
MotionGlobalConfig.skipAnimations = true;
