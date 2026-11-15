import { useApp } from "@lydie/plugin-api";
import { Button, Dialog, Popover, QuestionRegular } from "@lydie/plugin-api/ui";
import { useRef, useState } from "react";

import { changelogEntries } from "./entries/index.ts";
import { formatDate } from "./Text.tsx";
import { useUnseen } from "./use-seen.ts";

const LATEST = 3;

// The sidebar footer's "?": the latest changes on a short timeline, with a dot until they are seen.
export function ChangelogButton() {
  const app = useApp();
  const [unseen, markSeen] = useUnseen();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const latest = changelogEntries.slice(0, LATEST);
  if (latest.length === 0) return null;

  const go = (path: string) => {
    setOpen(false);
    app.open(path, { mode: "tab" });
  };

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-xs"
        aria-label={unseen ? "What's new (new changes)" : "What's new"}
        tooltipOptions={{ placement: "top", offset: 8 }}
        data-testid="changelog-button"
        data-unseen={unseen || undefined}
        onPress={() => {
          setOpen(true);
          markSeen();
        }}
        className="relative text-gray-500 hover:text-gray-700"
      >
        <QuestionRegular className="size-4" />
        {unseen && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-blue-500 ring-2 ring-canvas"
          />
        )}
      </Button>
      <Popover
        triggerRef={trigger}
        isOpen={open}
        onOpenChange={setOpen}
        placement="top start"
        className="w-80"
      >
        <Dialog aria-label="What's new" className="outline-none" data-testid="changelog-popover">
          <p className="px-4 pt-3 pb-1 text-sm font-medium text-gray-900">What's new</p>
          <ol className="relative px-2">
            {latest.length > 1 && (
              <span
                aria-hidden
                className="absolute top-5 bottom-5 left-[19px] w-px bg-gray-950/8"
              />
            )}
            {latest.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => go(`/changelog/${entry.id}`)}
                  className="relative flex w-full flex-col gap-0.5 rounded-md py-2 pr-2 pl-7 text-left outline-none hover:bg-gray-950/3 focus-visible:bg-gray-950/3"
                >
                  <span
                    aria-hidden
                    className="absolute top-[13px] left-[9px] size-[7px] rounded-full bg-gray-400 ring-4 ring-elevated"
                  />
                  <span className="text-xs text-gray-500">{formatDate(entry.date, "short")}</span>
                  <span className="text-sm font-medium text-gray-900">{entry.title}</span>
                  <span className="line-clamp-2 text-xs/relaxed text-gray-600">
                    {entry.summary}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-1 border-t border-gray-950/5 p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onPress={() => go("/changelog")}
            >
              See all changes
            </Button>
          </div>
        </Dialog>
      </Popover>
    </>
  );
}
