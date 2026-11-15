import { useApp, useOps } from "@lydie/plugin-api";
import type { Thread } from "@lydie/plugin-api";
import { useMembers } from "@lydie/plugin-api/databases";
import {
  Avatar,
  BotAvatar,
  Button,
  CheckRegular,
  DeleteRegular,
  LydieAvatar,
  TextArea,
} from "@lydie/plugin-api/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { authorOf, timeOf } from "./people.ts";
import type { Author, Members } from "./people.ts";

export function useAuthors(): Members {
  const members = useMembers();
  return useMemo(
    () =>
      new Map(
        [...members].map(([id, m]) => [id, { name: m.userName ?? null, image: m.userImage }]),
      ),
    [members],
  );
}

// A person on paper, an agent on a screen (with whom it worked for), Lydie in its green: the
// activity log's avatars.
export function AuthorAvatar({ author, size = 20 }: { author: Author; size?: number }) {
  const { avatar } = author;
  if (avatar.kind === "person")
    return <Avatar seed={avatar.seed} image={avatar.image} size={size} />;
  if (avatar.kind === "agent") {
    return <BotAvatar seed={avatar.seed} behalf={avatar.behalf} size={size} />;
  }
  return <LydieAvatar size={size} />;
}

// Focuses the field once it is on screen. The selection toolbar's button that opened it still
// has focus as it goes away, which leaves focus on the page: take it again a moment later
// unless the person has moved on to something else.
function useFocusWhenShown(ref: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const focus = () => {
      const field = ref.current;
      const current = document.activeElement;
      if (!field || current === field) return;
      // Nowhere, or still the editor or its toolbar, where the press came from.
      if (!current || current === document.body || current.closest("[data-lydie-editor]")) {
        field.focus({ preventScroll: true });
      }
    };
    ref.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(focus);
    const timers = [50, 200].map((ms) => setTimeout(focus, ms));
    return () => {
      cancelAnimationFrame(frame);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [ref, enabled]);
}

// A text field that sends on Mod+Enter; Escape cancels.
export function Composer({
  label,
  placeholder,
  submitLabel,
  autoFocus,
  rows = 2,
  buttons = "typing",
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  // Lines the field starts with (a reply: one, so a card stays compact).
  rows?: number;
  // A new comment shows Cancel and its button at once; a reply once something is typed.
  buttons?: "always" | "typing";
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const app = useApp();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useFocusWhenShown(field, !!autoFocus);
  const body = text.trim();
  const submit = async () => {
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setText("");
    } catch (error) {
      app.notify({
        kind: "error",
        title: "That could not be saved",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <TextArea
        ref={field}
        aria-label={label}
        placeholder={placeholder}
        size="sm"
        rows={rows}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="text-[0.8125rem]"
      />
      {(body || buttons === "always") && (
        <div className="flex items-center justify-end gap-1.5">
          {onCancel && (
            <Button size="xs" variant="ghost" onPress={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="xs" isDisabled={!body} isPending={busy} onPress={() => void submit()}>
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

// One message: the avatar in a column joined to the next message by a hairline, as in the
// activity log, then who and when, then what they said.
function Message({
  author,
  at,
  body,
  clamp,
  actions,
}: {
  author: Author;
  at: string;
  body: string;
  clamp?: boolean;
  actions?: ReactNode;
}) {
  return (
    <li className="group/message grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
      <div className="relative flex justify-center">
        <div
          aria-hidden
          className="absolute top-6 -bottom-2 left-1/2 w-px -translate-x-1/2 bg-gray-950/10 group-last/message:hidden"
        />
        <div className="relative flex size-5 items-center justify-center">
          <AuthorAvatar author={author} />
        </div>
      </div>
      <div className="min-w-0 pb-3 group-last/message:pb-0">
        <div className="flex min-h-5 items-center gap-1.5">
          <p className="flex min-w-0 grow items-baseline gap-1.5 text-xs">
            <span className="min-w-0 truncate font-medium text-gray-900">{author.name}</span>
            <time dateTime={at} className="shrink-0 text-gray-500">
              {timeOf(at)}
            </time>
          </p>
          {actions}
        </div>
        <p
          className={`mt-0.5 break-words whitespace-pre-wrap text-gray-700 ${clamp ? "line-clamp-3" : ""}`}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

type Props = {
  thread: Thread;
  // Open: every reply, the reply field, Resolve and Delete. Closed: what was said, in short.
  open: boolean;
  // What it was about, when that is not in the page any more.
  detached?: boolean;
  autoFocusReply?: boolean;
  onClose?: () => void;
};

// One thread: what was said and the replies, as a little timeline.
export function ThreadCard({ thread, open, detached, autoFocusReply, onClose }: Props) {
  const app = useApp();
  const ops = useOps();
  const members = useAuthors();
  const resolved = thread.resolvedAt !== null;
  const author = authorOf(thread.createdBy, members);
  const run = (action: Promise<unknown>) =>
    void action.catch((error: unknown) =>
      app.notify({
        kind: "error",
        title: "That did not work",
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  const actions = (
    <div
      className={`flex shrink-0 items-center ${open ? "" : "opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100"}`}
    >
      <Button
        size="icon-2xs"
        variant="ghost"
        className="text-gray-500"
        aria-label={resolved ? "Reopen" : "Resolve"}
        aria-pressed={resolved}
        onPress={() => run(ops.thread.resolve({ id: thread.id, resolved: !resolved }))}
      >
        <CheckRegular />
      </Button>
      <Button
        size="icon-2xs"
        variant="ghost"
        className="text-gray-500"
        aria-label="Delete"
        onPress={() => run(ops.thread.delete({ id: thread.id }))}
      >
        <DeleteRegular />
      </Button>
    </div>
  );
  const replies = thread.replies.length;
  return (
    <article
      aria-label={`Comment by ${author.name}`}
      data-testid="thread"
      data-thread-kind={thread.kind}
      data-open={open || undefined}
      className="group/card flex flex-col gap-2 text-[0.8125rem]"
    >
      {(detached || resolved) && thread.anchor && (
        <p className="border-l-2 border-gray-950/10 pl-2 text-xs text-gray-500">
          <span className="line-clamp-2">{thread.anchor.quote.replace(/\s+/g, " ")}</span>
          {detached && !resolved && <span className="mt-0.5 block">No longer in the page</span>}
        </p>
      )}
      <ol aria-label="Messages" className="flex flex-col">
        <Message
          author={author}
          at={thread.createdAt}
          body={thread.body}
          clamp={!open}
          actions={actions}
        />
        {open &&
          thread.replies.map((reply) => (
            <Message
              key={reply.id}
              author={authorOf(reply.createdBy, members)}
              at={reply.createdAt}
              body={reply.body}
            />
          ))}
      </ol>
      {!open && replies > 0 && (
        <p className="pl-7 text-xs text-gray-500">
          {replies === 1 ? "1 reply" : `${replies} replies`}
        </p>
      )}
      {open && !resolved && (
        <Composer
          label="Reply"
          placeholder="Reply"
          submitLabel="Reply"
          rows={1}
          autoFocus={autoFocusReply}
          onSubmit={(body) => ops.thread.reply({ threadId: thread.id, body })}
          {...(onClose ? { onCancel: onClose } : {})}
        />
      )}
    </article>
  );
}
