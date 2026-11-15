// Used by crash.test.ts: writes argv[3] to argv[2] with the bridge's atomic write and kills itself
// after the temp file is complete, right before the rename that would replace the target.
import { atomicWrite } from "./fs.ts";

const [target, content] = process.argv.slice(2);
if (!target || content === undefined) throw new Error("usage: crash-writer <target> <content>");
await atomicWrite(target, content, {
  beforeRename() {
    process.kill(process.pid, "SIGKILL");
  },
});
