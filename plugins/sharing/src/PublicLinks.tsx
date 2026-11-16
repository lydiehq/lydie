import { useApp, useQuery } from "@lydie/plugin-api";
import { useHostedQuery } from "@lydie/plugin-api/hosted";
import type { ShareLink } from "@lydie/plugin-api/hosted";
import {
  Button,
  focusRingClass,
  GlobeRegular,
  Input,
  Select,
  SelectItem,
  Switch,
  TextField,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { errorText } from "./errors.ts";

const EXPIRY: Record<string, { label: string; days: number | null }> = {
  never: { label: "Never expires", days: null },
  day: { label: "Expires in 1 day", days: 1 },
  week: { label: "Expires in 7 days", days: 7 },
  month: { label: "Expires in 30 days", days: 30 },
};

const expiresAt = (choice: string) => {
  const days = EXPIRY[choice]?.days ?? null;
  return days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
};

// "Publish to web": public, view-only links to the page (and its subpages). A link's token is shown
// once, when it is created; the list shows its last characters. Above them, whether the page is
// already on the web, from the synced links (the list itself needs full access).
export function PublicLinks({
  documentId,
  canManage,
  openPage,
}: {
  documentId: string;
  canManage: boolean;
  openPage: (id: string) => void;
}) {
  const app = useApp();
  const api = app.services!.account!;
  const links = useHostedQuery("shareLink.list", canManage ? { documentId } : null);
  const publicAccess = useQuery("doc.publicAccess", { id: documentId }).data[0];
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [subpages, setSubpages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; id: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const status = publicAccess && (
    <p className="flex items-start gap-1.5 text-xs text-gray-600" data-testid="public-status">
      <GlobeRegular aria-hidden className="mt-px size-3.5 shrink-0 text-blue-600" />
      {publicAccess.sourceId === documentId ? (
        <span>Anyone with a link to this page can view it.</span>
      ) : (
        <span>
          Anyone with the link to{" "}
          <button
            type="button"
            className={`rounded-xs underline decoration-gray-400/50 hover:decoration-gray-400 ${focusRingClass}`}
            onClick={() => openPage(publicAccess.sourceId)}
          >
            {publicAccess.sourceTitle || "Untitled"}
          </button>{" "}
          can view this page: the link includes subpages.
        </span>
      )}
    </p>
  );

  if (!canManage) {
    return (
      <div className="flex flex-col gap-2">
        {status}
        <p className="text-xs text-gray-500">
          Only people with full access can{" "}
          {publicAccess ? "change public links" : "publish this page"}.
        </p>
      </div>
    );
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    // A promise chain rather than try/finally, which the React Compiler cannot compile.
    const attempt = async () => {
      const result = await api.call("shareLink.create", {
        documentId,
        includeSubpages: subpages,
        expiresAt: expiresAt(expiry),
        password: password || null,
      });
      // The server builds the URL from its configured web origin; use this app's.
      setFresh({ url: api.webUrl(`/s/${result.token}`), id: result.shareLink.id });
      setCreating(false);
      setPassword("");
      await links.reload();
    };
    await attempt()
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const list = links.data?.shareLinks ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="public-links">
      {!fresh && status}
      {fresh && (
        <div className="flex flex-col gap-1 rounded-md bg-green-50 p-2 text-xs text-green-900">
          <span>Anyone with this link can view the page. Copy it now: it is not shown again.</span>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label="Public link"
              value={fresh.url}
              size="sm"
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                void navigator.clipboard?.writeText(fresh.url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      )}
      {list.map((link: ShareLink) => (
        <LinkRow key={link.id} link={link} reload={links.reload} />
      ))}
      {links.error && !links.data && (
        <p role="alert" className="text-xs text-red-600">
          {errorText(links.error)}
        </p>
      )}
      {creating ? (
        <div className="flex flex-col gap-2 rounded-md border border-gray-950/8 p-2">
          <TextField
            label="Password (optional)"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <Select
            aria-label="Expiry"
            selectedKey={expiry}
            onSelectionChange={(key) => setExpiry(String(key))}
          >
            {Object.entries(EXPIRY).map(([id, e]) => (
              <SelectItem key={id} id={id}>
                {e.label}
              </SelectItem>
            ))}
          </Select>
          <Switch isSelected={subpages} onChange={setSubpages}>
            Include subpages
          </Switch>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onPress={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="xs" onPress={() => void create()} isPending={busy}>
              Create link
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onPress={() => {
            setFresh(null);
            setCreating(true);
          }}
        >
          {list.length ? "Create another link" : "Publish to web"}
        </Button>
      )}
    </div>
  );
}

function LinkRow({ link, reload }: { link: ShareLink; reload: () => Promise<void> }) {
  const app = useApp();
  const api = app.services!.account!;
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = async (input: { password?: string | null; expiresAt?: string | null }) => {
    setError(null);
    try {
      await api.call("shareLink.update", { shareLinkId: link.id, ...input });
      setEditing(false);
      setPassword("");
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-gray-950/8 px-2 py-1.5 text-xs"
      data-testid="share-link"
    >
      <div className="flex items-center gap-2">
        <span className="grow text-gray-700">
          Link …{link.tokenHint}
          <span className="text-gray-400">
            {" · "}
            {link.hasPassword ? "Password" : "No password"}
            {" · "}
            {link.expiresAt
              ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
              : "No expiry"}
            {link.includeSubpages ? " · With subpages" : ""}
          </span>
        </span>
        <Button size="xs" variant="ghost" onPress={() => setEditing(!editing)}>
          Change
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onPress={async () => {
            if (
              !(await app.confirm({
                message: "Turn off this link?",
                detail: "Anyone using it loses access.",
                confirmLabel: "Turn off",
                destructive: true,
              }))
            )
              return;
            try {
              await api.call("shareLink.revoke", { shareLinkId: link.id });
              await reload();
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Revoke
        </Button>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label={link.hasPassword ? "New password" : "Password"}
            type="password"
            value={password}
            onChange={setPassword}
            size="sm"
            className="grow"
          />
          <Button size="sm" isDisabled={!password} onPress={() => void change({ password })}>
            Set
          </Button>
          {link.hasPassword && (
            <Button size="sm" variant="secondary" onPress={() => void change({ password: null })}>
              Remove password
            </Button>
          )}
          <Select
            aria-label="Expiry"
            placeholder="Change expiry"
            size="sm"
            onSelectionChange={(key) => void change({ expiresAt: expiresAt(String(key)) })}
          >
            {Object.entries(EXPIRY).map(([id, e]) => (
              <SelectItem key={id} id={id}>
                {e.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
