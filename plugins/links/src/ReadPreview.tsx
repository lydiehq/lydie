// The hover card for links outside the editor (backlinks, search results, the tree), through
// `useHoverPreview`: the same preview and open buttons as the editor's popover, without editing.
import { useApp } from "@lydie/plugin-api";
import { Button } from "@lydie/plugin-api/ui";

import {
  CardActions,
  DocPreview,
  ExternalPreview,
  OpenButtons,
  UnresolvedPreview,
  useResolved,
} from "./LinkCard.tsx";
import { follow, openExternal } from "./open.ts";
import { parsePreviewTarget } from "./targets.ts";

export function ReadPreview({ target, sourceId }: { target: string; sourceId?: string | null }) {
  const app = useApp();
  const parsed = parsePreviewTarget(target);
  const wiki = parsed.kind === "wiki" ? parsed.link : null;
  const resolved = useResolved(wiki ? wiki.target : null, sourceId ?? null);
  if (parsed.kind === "url") {
    return (
      <>
        <ExternalPreview href={parsed.href} />
        <CardActions>
          <Button size="sm" variant="ghost" onPress={() => openExternal(parsed.href)}>
            Open in browser
          </Button>
        </CardActions>
      </>
    );
  }
  const id = parsed.kind === "doc" ? parsed.id : resolved.state === "found" ? resolved.id : null;
  const part = parsed.kind === "doc" ? parsed : wiki!;
  if (!id) {
    return resolved.state === "missing" ? (
      <UnresolvedPreview target={wiki?.target ?? ""} />
    ) : (
      <div className="h-16" aria-busy="true" />
    );
  }
  return (
    <>
      <DocPreview id={id} heading={part.heading} blockId={part.blockId} />
      <CardActions>
        <OpenButtons
          onOpen={(mode) =>
            void follow(
              app,
              { target: id, heading: part.heading, blockId: part.blockId },
              sourceId ?? null,
              mode,
            )
          }
        />
      </CardActions>
    </>
  );
}
