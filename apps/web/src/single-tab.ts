// Where PowerSync cannot share one database between tabs (Safari, iOS, Android: no shared worker
// support), only one tab may open it. A Web Lock decides which; another tab can take over.
const LOCK = "lydie:local-database";

// PowerSync's own rule for enabling multi-tab support (resolveAndValidateOptions in @powersync/web).
export function multiTabSupported(): boolean {
  return (
    typeof SharedWorker !== "undefined" &&
    !navigator.userAgent.match(/(Android|iPhone|iPod|iPad)/i) &&
    !(window as { safari?: unknown }).safari
  );
}

export class OtherTabError extends Error {
  constructor() {
    super("Lydie is open in another tab");
    this.name = "OtherTabError";
  }
}

// Holds the lock for the life of the page. Resolves once held; rejects with OtherTabError when
// another tab has it (unless `steal`). `onLost` runs if another tab takes it over.
export function holdSingleTabLock(options: { steal?: boolean; onLost: () => void }): Promise<void> {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = options.steal
      ? navigator.locks.request(LOCK, { steal: true }, () => {
          resolve();
          return new Promise<void>(() => {});
        })
      : navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
          if (!lock) {
            reject(new OtherTabError());
            return;
          }
          resolve();
          return new Promise<void>(() => {});
        });
    // A held lock's request only settles when another tab steals it.
    request.catch(() => options.onLost());
  });
}
