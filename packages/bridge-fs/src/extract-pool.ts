// Markdown extraction off the calling thread, for indexing many files at once. Parsing is most of
// a first index (the help vault: 9.5 of 14 s), and in the desktop app the calling thread is
// Electron's main process, which answers every window meanwhile. Threads extract bodies in jobs;
// the caller keeps the database writes and their order. A job no thread did (none could start, as
// in Node without TypeScript or a bundle without the entry, or its thread failed) is extracted in
// the calling thread, with the same result.
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { Extracted } from "@lydie/runtime";

import { extractBody } from "./content.ts";

// Starts a thread running extract-worker.ts. A bundled app passes its own build of that entry.
export type ExtractWorker = () => Worker;

// Works where the TypeScript sources run (Bun).
export const defaultExtractWorker: ExtractWorker = () =>
  new Worker(new URL("./extract-worker.ts", import.meta.url));

// Bodies that take less than about 25 ms to extract stay in the calling thread (a few notes, small
// ones): starting threads would cost more than it saves. Extracting costs about a microsecond per
// 3 characters, plus 30 per body.
const MIN_COST = 64 * 1024;
const BODY_COST = 100;
// Bodies per message: a chunk of the index spreads over the threads, messages stay few.
const JOB_SIZE = 100;
const MAX_THREADS = 4;

type Job = { id: number; bodies: string[]; done: (extracted: Extracted[] | null) => void };
type Thread = { worker: Worker; job: Job | null };

export class ExtractPool {
  private readonly threads = new Set<Thread>();
  private readonly queue: Job[] = [];
  private nextId = 0;

  // A pool for extracting `bodies`, or null when that is quick or no thread starts. One core
  // stays with the calling thread.
  static start(create: ExtractWorker, bodies: readonly string[]): ExtractPool | null {
    let cost = 0;
    for (const body of bodies) cost += body.length + BODY_COST;
    if (cost < MIN_COST) return null;
    const jobs = Math.ceil(bodies.length / JOB_SIZE);
    const size = Math.min(MAX_THREADS, availableParallelism() - 1, jobs);
    const pool = new ExtractPool();
    for (let i = 0; i < size; i++) {
      try {
        pool.add(create());
      } catch {
        break;
      }
    }
    return pool.threads.size ? pool : null;
  }

  // Starts extracting `bodies`; the returned function resolves their extracts in order, extracting
  // here what no thread did.
  extract(bodies: string[]): () => Promise<Extracted[]> {
    const parts: string[][] = [];
    for (let i = 0; i < bodies.length; i += JOB_SIZE) parts.push(bodies.slice(i, i + JOB_SIZE));
    const jobs = parts.map((part) => this.run(part));
    return async () => {
      const out: Extracted[] = [];
      for (const [i, job] of jobs.entries()) {
        out.push(...((await job) ?? parts[i]!.map(extractBody)));
      }
      return out;
    };
  }

  async close(): Promise<void> {
    const threads = [...this.threads];
    this.threads.clear();
    for (const job of this.queue.splice(0)) job.done(null);
    for (const thread of threads) thread.job?.done(null);
    await Promise.all(threads.map((thread) => thread.worker.terminate()));
  }

  private run(bodies: string[]): Promise<Extracted[] | null> {
    return new Promise((done) => {
      this.queue.push({ id: this.nextId++, bodies, done });
      this.next();
    });
  }

  private add(worker: Worker): void {
    const thread: Thread = { worker, job: null };
    this.threads.add(thread);
    worker.on("message", (message: { id: number; extracted: Extracted[] }) => {
      const job = thread.job;
      if (job?.id !== message.id) return;
      thread.job = null;
      job.done(message.extracted);
      this.next();
    });
    const fail = () => {
      if (!this.threads.delete(thread)) return;
      thread.job?.done(null);
      thread.job = null;
      void worker.terminate();
      if (!this.threads.size) for (const job of this.queue.splice(0)) job.done(null);
    };
    worker.on("error", fail);
    worker.on("messageerror", fail);
    worker.on("exit", fail);
  }

  private next(): void {
    for (const thread of this.threads) {
      if (thread.job) continue;
      const job = this.queue.shift();
      if (!job) return;
      thread.job = job;
      thread.worker.postMessage({ id: job.id, bodies: job.bodies });
    }
  }
}
