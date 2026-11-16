import type { TabPath } from "@lydie/contract";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

import type { AppApi, OpenOptions } from "./plugin.ts";
import { useApp } from "./react.tsx";

export type OpenMode = NonNullable<OpenOptions["mode"]>;

type Click = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

// How a click on a link to a page opens it, or null when the click is the browser's (the web app's
// modified and middle clicks: a browser tab or window, as on any page). In the desktop app every
// left or middle click is the app's, since a link must never navigate the window there. Other
// buttons are never the app's.
export function linkMode(app: AppApi, event: Click): OpenMode | null {
  if (event.button !== 0 && event.button !== 1) return null;
  if (app.linkClicks === "browser") {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    return modified || event.button !== 0 ? null : "replace";
  }
  return app.modeFor(event) ?? "replace";
}

export type PageLinkOptions = {
  // A document's title, for its readable URL.
  title?: string | null;
  // Opens the page another way than `app.open(path, { mode })` (a collection's view, a peek).
  onOpen?: (mode: OpenMode) => void;
};

export type PageLinkProps = {
  href: string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onAuxClick: (event: MouseEvent<HTMLElement>) => void;
};

// What an `<a>` to a page of the app needs: a real href (so the browser's link menu, dragging the
// link out and modified clicks work on the web), and clicks that are the app's opened in the app.
// A handler that ran first and called `preventDefault` keeps the click.
export function pageLinkProps(
  app: AppApi,
  path: TabPath,
  options: PageLinkOptions = {},
): PageLinkProps {
  const follow = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const mode = linkMode(app, event);
    if (mode === null) return;
    event.preventDefault();
    if (options.onOpen) options.onOpen(mode);
    else app.open(path, { mode });
  };
  return {
    href: app.href(path, options.title),
    onClick: (event) => {
      if (event.button === 0) follow(event);
    },
    onAuxClick: (event) => {
      if (event.button === 1) follow(event);
    },
  };
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  PageLinkOptions & {
    path: TabPath;
    children?: ReactNode;
    // Passed on to the `<a>` (tooltips and hover cards attach to it).
    ref?: Ref<HTMLAnchorElement>;
  };

// A link to a page of the app (see `pageLinkProps`). Its own onClick/onAuxClick run first.
export function PageLink({ path, title, onOpen, onClick, onAuxClick, children, ...props }: Props) {
  const app = useApp();
  const link = pageLinkProps(app, path, { title, ...(onOpen ? { onOpen } : {}) });
  return (
    <a
      {...props}
      href={link.href}
      onClick={(event) => {
        onClick?.(event);
        link.onClick(event);
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        link.onAuxClick(event);
      }}
    >
      {children}
    </a>
  );
}
