// A thread of the index's extraction pool (extract-pool.ts): answers each job with its bodies'
// extracts. A body that throws ends the thread; the pool then extracts the job in the calling thread.
import { parentPort } from "node:worker_threads";

import { extractBody } from "./content.ts";

parentPort?.on("message", (job: { id: number; bodies: string[] }) => {
  parentPort!.postMessage({ id: job.id, extracted: job.bodies.map(extractBody) });
});
