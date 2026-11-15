// Building blocks for settings pages, after the owner's settings layout: pages are sections of
// cards of rows (label left, a compact control right), lists of items open a details panel on the
// right, and text fields save on blur or Enter with a quiet status instead of a Save button.
import clsx from "clsx";
import {
  createContext,
  Fragment,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";

import { Button } from "../components/Button";
import { Input } from "../components/Field";
import { CloseRegular } from "../icons/mingcute";

// Section titles sit on the page's text edge; boxed content (cards, banners) bleeds into the page
// gutter by its own padding plus border, so the text inside lines up with them.
export const settingsBoxBleedClass = "-mx-[calc(1rem+1px)]";

export function SettingsSections({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("flex flex-col gap-10", className)} {...props} />;
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={clsx("min-w-0 scroll-mt-8", className)} {...props}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-medium text-gray-900">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function SettingsCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "min-w-0 divide-y divide-gray-950/5 rounded-xl border border-gray-950/8 bg-surface",
        settingsBoxBleedClass,
        className,
      )}
      {...props}
    />
  );
}

// Label and description on the left, the control on the right; wraps when narrow.
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 basis-48">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-gray-900">
            {label}
          </label>
        ) : (
          <div className="text-sm font-medium text-gray-900">{label}</div>
        )}
        {description && <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function SettingsCardBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("min-w-0 p-4", className)} {...props} />;
}

// A list card's first row: what it holds and the action that adds to it.
export function SettingsCardHeader({
  title,
  actions,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title: ReactNode; actions?: ReactNode }) {
  return (
    <div
      className={clsx("flex min-h-12 items-center justify-between gap-4 px-4 py-2", className)}
      {...props}
    >
      <div className="min-w-0 truncate text-sm font-medium text-gray-900">{title}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// A list with nothing in it, still loading, or failed.
export function SettingsCardEmpty({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-gray-500",
        className,
      )}
      {...props}
    />
  );
}

// One item of a card list: an icon, a name and facts joined by "·". With `onPress` the whole item
// is one button (it opens the details panel); buttons in `trailing` keep their own clicks.
export function SettingsListItem({
  icon,
  title,
  meta,
  onPress,
  selected,
  trailing,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode | ReactNode[];
  onPress?: () => void;
  selected?: boolean;
  trailing?: ReactNode;
}) {
  const facts = (Array.isArray(meta) ? meta : [meta]).filter(
    (fact) => fact !== null && fact !== undefined && fact !== false && fact !== "",
  );
  return (
    <div
      className={clsx(
        "relative flex min-h-14 items-center gap-3 px-4 py-2.5 first:rounded-t-[inherit] last:rounded-b-[inherit]",
        // The title's button covers the row (`after:inset-0`), so the row draws its focus ring.
        onPress &&
          "outline-solid outline-0 -outline-offset-2 outline-blue-600 hover:bg-gray-950/3 has-[:focus-visible]:outline-2",
        selected && "bg-gray-950/4",
        className,
      )}
      {...props}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {onPress ? (
          <button
            type="button"
            data-settings-details-trigger
            aria-expanded={selected ?? false}
            onClick={onPress}
            className="block max-w-full truncate text-left text-sm font-medium text-gray-900 outline-none after:absolute after:inset-0"
          >
            {title}
          </button>
        ) : (
          <span className="block max-w-full truncate text-sm font-medium text-gray-900">
            {title}
          </span>
        )}
        {facts.length > 0 && (
          <p className="mt-0.5 truncate text-xs leading-5 text-gray-500">
            {facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                )}
                {fact}
              </Fragment>
            ))}
          </p>
        )}
      </div>
      {trailing && <div className="relative flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}

// ---- Escape: the innermost layer (a details panel) closes first, then the settings.

type EscapeStack = { push(handler: () => void): () => void };

export const SettingsEscapeContext = createContext<EscapeStack | null>(null);

export function createEscapeStack(): EscapeStack & { pop(): boolean } {
  const handlers: (() => void)[] = [];
  return {
    push(handler) {
      handlers.push(handler);
      return () => {
        const index = handlers.lastIndexOf(handler);
        if (index !== -1) handlers.splice(index, 1);
      };
    },
    // Runs the innermost handler; false when there is none.
    pop() {
      const handler = handlers.at(-1);
      if (!handler) return false;
      handler();
      return true;
    },
  };
}

// The panel a list item opens, over the right of the settings content. Non-modal: other items stay
// clickable (and switch it); Escape and ✕ close it, and focus returns to the list.
export function SettingsDetailsPanel({
  title,
  description,
  icon,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const stack = use(SettingsEscapeContext);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => stack?.push(() => close.current()), [stack]);
  const titleId = useId();
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="settings-details"
      className="absolute inset-y-2 right-2 z-20 flex w-96 max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg bg-elevated shadow-popover"
    >
      <div className="flex items-center gap-3 border-b border-gray-950/5 p-4">
        {icon}
        <div className="min-w-0">
          <h3 id={titleId} className="truncate text-base font-medium text-gray-900">
            {title}
          </h3>
          {description && <p className="truncate text-sm text-gray-500">{description}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close details"
          className="ml-auto shrink-0"
          onPress={onClose}
        >
          <CloseRegular className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
      {footer && (
        <div className="flex items-center gap-2 border-t border-gray-950/5 p-4">{footer}</div>
      )}
    </aside>
  );
}

export function SettingsDetailsList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-x-6 gap-y-3 text-sm [&_dt]:text-gray-500">
      {children}
    </dl>
  );
}

// ---- Saving

export type SettingsSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
  save(run: () => Promise<unknown>): Promise<boolean>;
  clear(): void;
};

export function useSettingsSave(): SettingsSaveState {
  const [state, setState] = useState<{ status: SettingsSaveState["status"]; error: string | null }>(
    { status: "idle", error: null },
  );
  return {
    ...state,
    async save(run) {
      setState({ status: "saving", error: null });
      try {
        await run();
        setState({ status: "saved", error: null });
        return true;
      } catch (error) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    clear: () => setState({ status: "idle", error: null }),
  };
}

// Screen readers hear "Saving…"/"Saved"; a failure is shown with Retry.
export function SettingsSaveStatus({
  state,
  id,
  onRetry,
}: {
  state: SettingsSaveState;
  id?: string;
  onRetry: () => void;
}) {
  return (
    <output
      id={id}
      aria-live={state.status === "saved" ? "off" : "polite"}
      className={state.status === "error" ? "flex items-center gap-1 text-xs" : "sr-only"}
    >
      {state.status === "saving" && "Saving…"}
      {state.status === "saved" && "Saved"}
      {state.status === "error" && (
        <>
          <span className="text-red-600">Could not save: {state.error}</span>
          <Button variant="ghost" size="xs" onPress={onRetry}>
            Retry
          </Button>
        </>
      )}
    </output>
  );
}

// A text value that saves when it loses focus or on Enter (Escape restores it). It keeps its own
// draft, so a value arriving from sync cannot replace what is being typed.
export function SettingsTextInput({
  value,
  onSave,
  required,
  validate,
  className,
  ...props
}: {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  required?: boolean;
  // An error message, or "" when valid.
  validate?: (value: string) => string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) {
  const state = useSettingsSave();
  const statusId = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState("");
  const accepted = useRef(value);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current && value !== accepted.current) {
      accepted.current = value;
      setDraft(value);
    }
  }, [value]);

  const submit = async () => {
    const next = draft.trim();
    const problem = !next && required ? "Required" : next ? (validate?.(next) ?? "") : "";
    setInvalid(problem);
    if (problem || next === accepted.current) return;
    const ok = await state.save(() => onSave(next));
    if (ok) accepted.current = next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && draft !== accepted.current) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(accepted.current);
      setInvalid("");
      state.clear();
    }
  };

  return (
    <div className={clsx("flex w-64 max-w-full flex-col gap-1", className)}>
      <Input
        {...props}
        value={draft}
        aria-invalid={Boolean(invalid) || state.status === "error" || undefined}
        aria-describedby={statusId}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setInvalid("");
          if (state.status !== "idle") state.clear();
        }}
        onFocus={() => (editing.current = true)}
        onBlur={() => {
          editing.current = false;
          void submit();
        }}
        onKeyDown={onKeyDown}
      />
      {invalid ? (
        <output id={statusId} aria-live="polite" className="text-xs text-red-600">
          {invalid}
        </output>
      ) : (
        <SettingsSaveStatus id={statusId} state={state} onRetry={() => void submit()} />
      )}
    </div>
  );
}
