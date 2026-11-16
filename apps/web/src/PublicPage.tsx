// `/s/<token>[/<pageId>]`: a page published to the web with a public link. Read-only and without an
// account: the server renders safe HTML (links between the shared pages point at `/s/<token>/<id>`),
// with the shared subpages beside it and a password prompt when the link has one.
import { contentLineStart } from "@lydie/editor";
import { pageColumnClass } from "@lydie/plugin-api";
import { fetchPublicShare } from "@lydie/sdk";
import type { PublicShare, PublicShareResult } from "@lydie/sdk";
import {
  Button,
  EmptyState,
  focusRingInsetClass,
  Heading,
  LoadingState,
  sidebarItemStyles,
  TextField,
} from "@lydie/ui";
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, MouseEvent } from "react";

import { apiUrl, webBase } from "./hosted.ts";

function parse(pathname: string): { token: string; pageId: string | null } {
  const rest = pathname.slice(webBase().length).replace(/^\/+/, "");
  const [, token = "", pageId] = rest.split("/");
  return { token: decodeURIComponent(token), pageId: pageId ? decodeURIComponent(pageId) : null };
}

const passwordKey = (token: string) => `lydie:share-password:${token}`;

export function PublicPage() {
  const [location, setLocation] = useState(() => parse(window.location.pathname));
  const [password, setPassword] = useState<string | null>(() =>
    sessionStorage.getItem(passwordKey(location.token)),
  );
  const [result, setResult] = useState<PublicShareResult | null>(null);

  useEffect(() => {
    let live = true;
    setResult(null);
    void fetchPublicShare({
      baseUrl: apiUrl(),
      token: location.token,
      documentId: location.pageId,
      password,
    }).then((next) => {
      if (!live) return;
      setResult(next);
      if (next.status === "ok") {
        document.title = next.share.document.title || "Untitled";
        if (password) sessionStorage.setItem(passwordKey(location.token), password);
      }
    });
    return () => {
      live = false;
    };
  }, [location, password]);

  useEffect(() => {
    const onPop = () => setLocation(parse(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (pageId: string | null) => {
    const path = `${webBase()}s/${encodeURIComponent(location.token)}${pageId ? `/${encodeURIComponent(pageId)}` : ""}`;
    history.pushState(null, "", path);
    setLocation({ token: location.token, pageId });
    window.scrollTo({ top: 0 });
  };

  if (!result) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Opening the page" />
      </div>
    );
  }
  if (result.status === "password-required") {
    return <PasswordPrompt wrong={result.wrongPassword} onSubmit={setPassword} />;
  }
  if (result.status !== "ok") {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <EmptyState
          title={
            result.status === "not-found"
              ? "This page is not shared"
              : result.status === "rate-limited"
                ? "Too many attempts"
                : "This page could not be opened"
          }
          description={
            result.status === "not-found"
              ? "The link may have expired or been turned off."
              : result.status === "rate-limited"
                ? "Wait a minute, then try again."
                : result.message
          }
        />
      </div>
    );
  }
  return <SharedPage share={result.share} go={go} />;
}

function PasswordPrompt({ wrong, onSubmit }: { wrong: boolean; onSubmit: (p: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value) onSubmit(value);
  };
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-surface p-6 shadow-surface ring ring-gray-950/5"
      >
        <Heading level={1} className="text-lg font-medium text-gray-900">
          This page is protected
        </Heading>
        <TextField
          label="Password"
          type="password"
          isRequired
          value={value}
          onChange={setValue}
          errorMessage={wrong ? "That password is not right." : undefined}
          isInvalid={wrong}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page's only field
          autoFocus
        />
        <Button type="submit">Open page</Button>
      </form>
    </div>
  );
}

function SharedPage({ share, go }: { share: PublicShare; go: (pageId: string | null) => void }) {
  const rootId = share.link.rootId;
  const pages = share.tree;
  // Links between shared pages are `/s/<token>/<id>`: follow them without reloading.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const match = /\/s\/[^/]+\/([^/?#]+)/.exec(href);
    if (match) {
      event.preventDefault();
      go(decodeURIComponent(match[1]!) === rootId ? null : decodeURIComponent(match[1]!));
    }
  };
  return (
    <div className="flex min-h-dvh bg-surface" data-testid="public-page">
      {pages.length > 1 && (
        <nav
          aria-label="Shared pages"
          className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-r border-gray-950/5 bg-gray-50 p-3 md:block"
        >
          <ul className="flex flex-col">
            {pages.map((p) => (
              <li key={p.id}>
                {/* The app sidebar's rows (sidebarItemStyles), not a button look. */}
                <button
                  type="button"
                  aria-current={p.id === share.document.id ? "page" : undefined}
                  onClick={() => go(p.id === rootId ? null : p.id)}
                  style={{ paddingLeft: 8 + p.depth * 12 }}
                  className={sidebarItemStyles({
                    isCurrent: p.id === share.document.id,
                    className: `w-full pr-2 text-left ${focusRingInsetClass}`,
                  })}
                >
                  <span className="truncate">{p.title || "Untitled"}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {/* Laid out as in the editor: the title in the page column, the body's blocks in the same
          column through editor-content.css's `data-doc-content` rules (collections span the width). */}
      <main className="min-w-0 flex-1 py-16">
        <h1
          className={`${pageColumnClass(false)} mb-6 text-[1.75rem] leading-tight font-medium tracking-[-0.05rem] text-gray-950`}
        >
          {share.document.title || "Untitled"}
        </h1>
        {/* The server renders this HTML from the parsed document with everything escaped. */}
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- delegates link clicks */}
        <article
          className="editor-content"
          data-doc-content=""
          style={{ "--editor-content-line-start": contentLineStart(false) } as CSSProperties}
          onClick={onClick}
          // oxlint-disable-next-line react/no-danger -- safe HTML from the server (see above)
          dangerouslySetInnerHTML={{ __html: share.body.html }}
        />
      </main>
    </div>
  );
}
