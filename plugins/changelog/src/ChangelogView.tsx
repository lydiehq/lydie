import { useApp } from "@lydie/plugin-api";
import type { ViewProps } from "@lydie/plugin-api";
import { useEffect } from "react";

import { CHANGELOG_URL, changelogEntries } from "./entries/index.ts";
import { markSeen } from "./seen.ts";
import { formatDate, Text } from "./Text.tsx";
import type { ChangelogEntry } from "./types.ts";

const link =
  "text-gray-900 underline decoration-gray-950/20 underline-offset-4 hover:decoration-gray-950/50";

// `/changelog`, or `/changelog/<id>` to start at an entry: every entry down a timeline.
export function ChangelogView({ tab }: ViewProps) {
  const app = useApp();
  const id = tab.path.startsWith("/changelog/") ? tab.path.slice("/changelog/".length) : null;
  // The footer's dot follows through the storage subscription.
  useEffect(() => markSeen(app.storage, changelogEntries), [app]);
  useEffect(() => {
    if (id) document.getElementById(`changelog-${id}`)?.scrollIntoView({ block: "start" });
  }, [id]);

  return (
    <div className="min-h-0 grow overflow-y-auto" data-testid="changelog-view">
      <div className="mx-auto w-full max-w-[680px] px-6 pt-14 pb-24">
        <h1 className="text-2xl font-medium tracking-tight text-gray-900">What's new</h1>
        <p className="mt-2 text-sm text-gray-500">
          Changes to Lydie, newest first. Also on{" "}
          <a href={CHANGELOG_URL} target="_blank" rel="noreferrer" className={link}>
            lydie.co/changelog
          </a>
          .
        </p>
        <ol className="relative mt-12 flex flex-col gap-14">
          <span aria-hidden className="absolute inset-y-2 left-[3px] w-px bg-gray-950/8" />
          {changelogEntries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  return (
    <li id={`changelog-${entry.id}`} className="relative scroll-mt-10 pl-8">
      <span
        aria-hidden
        className="absolute top-[7px] left-0 size-[7px] rounded-full bg-gray-400 ring-4 ring-surface"
      />
      <time dateTime={entry.date} className="block text-sm text-gray-500">
        {formatDate(entry.date)}
      </time>
      <h2 className="mt-1 text-lg font-medium tracking-tight text-balance text-gray-900">
        {entry.title}
      </h2>
      <p className="mt-2 text-sm/relaxed text-pretty text-gray-700">
        <Text>{entry.summary}</Text>
      </p>
      {entry.sections?.map((section, i) => (
        <section key={section.heading ?? i} className="mt-4">
          {section.heading && (
            <h3 className="text-sm font-medium text-gray-900">{section.heading}</h3>
          )}
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-1 text-sm/relaxed text-pretty text-gray-600">
              <Text>{paragraph}</Text>
            </p>
          ))}
        </section>
      ))}
      {entry.links && entry.links.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {entry.links.map((item) => (
            <li key={item.href}>
              <a href={item.href} target="_blank" rel="noreferrer" className={link}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
