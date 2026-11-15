import { useApp } from "@lydie/plugin-api";
import { useEffect, useState } from "react";

import { changelogEntries } from "./entries/index.ts";
import { hasUnseen, markSeen, SEEN_KEY } from "./seen.ts";

// Whether a change came out since this device last opened the changelog, and a way to mark it seen.
export function useUnseen(): [unseen: boolean, markSeen: () => void] {
  const app = useApp();
  const [seen, setSeen] = useState(() => app.storage.get<string>(SEEN_KEY));
  useEffect(
    () => app.storage.subscribe?.(SEEN_KEY, () => setSeen(app.storage.get<string>(SEEN_KEY))),
    [app],
  );
  return [
    hasUnseen(changelogEntries, seen),
    () => {
      markSeen(app.storage, changelogEntries);
      setSeen(app.storage.get<string>(SEEN_KEY));
    },
  ];
}
