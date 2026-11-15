// Runs tasks one at a time. Everything that reads or writes the folder or the index goes through
// one queue, so a watcher batch never interleaves with writing an operation's result. Urgent tasks
// (writing operations' results) run before waiting ordinary ones (watcher batches): an operation's
// change must reach its file before a batch compares the file with the database.
type Task = {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

export class SerialQueue {
  private readonly urgent: Task[] = [];
  private readonly normal: Task[] = [];
  private running = false;
  private waiters: (() => void)[] = [];

  run<T>(task: () => Promise<T>, options: { urgent?: boolean } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      (options.urgent ? this.urgent : this.normal).push({
        run: task,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let task = this.next(); task; task = this.next()) {
        try {
          task.resolve(await task.run());
        } catch (error) {
          task.reject(error);
        }
      }
    } finally {
      this.running = false;
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w();
    }
  }

  private next(): Task | undefined {
    return this.urgent.shift() ?? this.normal.shift();
  }

  get busy(): boolean {
    return this.running || this.urgent.length > 0 || this.normal.length > 0;
  }

  // Resolves when every task queued so far has finished.
  async idle(): Promise<void> {
    while (this.busy) await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
}

// Maps with at most `limit` calls in flight.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!, i);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
