import { useApp } from "@lydie/plugin-api";
import { Button } from "@lydie/plugin-api/ui";
import { useState } from "react";

import { AvatarsPlayground } from "./avatars/AvatarsPlayground.tsx";
import { EmptyStatesPlayground } from "./empty-states/EmptyStatesPlayground.tsx";
import { MacIconPlayground } from "./mac-icon/MacIconPlayground.tsx";
import { DrawPlayground } from "./scribbles/DrawPlayground.tsx";
import { ScribblesPlayground } from "./scribbles/ScribblesPlayground.tsx";

const STORAGE_KEY = "exploration";

const EXPLORATIONS = [
  { id: "scribbles", name: "Scribbles", component: ScribblesPlayground },
  { id: "draw", name: "Draw your own", component: DrawPlayground },
  { id: "avatars", name: "Avatars", component: AvatarsPlayground },
  { id: "mac-icon", name: "Mac icon", component: MacIconPlayground },
  { id: "empty-states", name: "Empty states", component: EmptyStatesPlayground },
] as const;

type Id = (typeof EXPLORATIONS)[number]["id"];

export function Explorations() {
  const app = useApp();
  const [current, setCurrent] = useState<Id>(() => app.storage.get<Id>(STORAGE_KEY) ?? "scribbles");
  const exploration = EXPLORATIONS.find((e) => e.id === current) ?? EXPLORATIONS[0];
  const Page = exploration.component;
  return (
    <div className="flex min-h-0 grow flex-col">
      <nav aria-label="Explorations" className="flex shrink-0 items-center gap-1 px-6 pt-3">
        {EXPLORATIONS.map((e) => (
          <Button
            key={e.id}
            size="xs"
            variant="ghost"
            data-current={e.id === current || undefined}
            onPress={() => {
              setCurrent(e.id);
              app.storage.set(STORAGE_KEY, e.id);
            }}
          >
            {e.name}
          </Button>
        ))}
      </nav>
      <Page />
    </div>
  );
}
