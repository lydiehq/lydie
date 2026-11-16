// Pages that run outside the app (invitation, OAuth consent): one session for the hosted API, the
// signed-in state, and an inline sign-in / sign-up form. No workspace is opened for them.
import { LYDIE_VERSION } from "@lydie/contract";
import { createApiCaller } from "@lydie/sdk";
import { createSession, readProviderReturn, withoutProviderReturn } from "@lydie/sync";
import { Button, TextField } from "@lydie/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

import { apiUrl, toHostedError } from "./hosted.ts";
import { createWebPlatform } from "./platform.ts";

export const session = createSession({
  baseUrl: apiUrl(),
  secrets: createWebPlatform().secrets,
  version: LYDIE_VERSION,
});

// Back from signing in with Google on this page: the token becomes the session (the page then
// renders signed in); an error code is shown by the form. Resolves to that code or null.
const providerReturn: Promise<string | null> = (async () => {
  const here = new URL(window.location.href);
  const returned = readProviderReturn(here);
  if (!returned) return null;
  window.history.replaceState(window.history.state, "", withoutProviderReturn(here).toString());
  if ("error" in returned) return returned.error;
  try {
    await session.signInWithToken(returned.token);
    return null;
  } catch (error) {
    return toHostedError(error).code ?? "failed";
  }
})();

const GOOGLE_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  unavailable: "Signing in with Google is not available right now.",
};

export const api = createApiCaller(async (request) => {
  try {
    return (
      await session.api.send(request.method, request.path, {
        ...(request.body !== undefined ? { body: request.body } : {}),
      })
    ).data;
  } catch (error) {
    throw toHostedError(error);
  }
});

export function useSessionState() {
  return useSyncExternalStore(
    (listener) => session.state.subscribe(() => listener()),
    () => session.state.get(),
  );
}

export function AuthForm({ initialMode = "sign-up" }: { initialMode?: "sign-in" | "sign-up" }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void providerReturn.then((code) => {
      if (code) setError(GOOGLE_ERRORS[code] ?? "Signing in with Google did not work. Try again.");
    });
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const credentials = { email: email.trim(), password };
    // Not `try`: the React Compiler skips a component with a condition inside one.
    const failed = await (
      mode === "sign-up"
        ? session.signUp({ ...credentials, ...(name.trim() ? { name: name.trim() } : {}) })
        : session.signIn(credentials)
    ).then(
      () => null,
      (e: unknown) => toHostedError(e),
    );
    if (failed) {
      const exists = /already/i.test(failed.message) || /ALREADY/.test(failed.code ?? "");
      setError(
        exists
          ? "There is already an account with this email. Sign in instead."
          : failed.status === 401
            ? "That password does not match."
            : failed.message,
      );
      if (exists) setMode("sign-in");
    }
    setBusy(false);
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {/* Comes back to this page (the invitation or consent request) signed in. */}
      <Button
        variant="secondary"
        onPress={() => window.location.assign(session.socialUrl("google", window.location.href))}
      >
        Continue with Google
      </Button>
      <TextField
        label="Email"
        type="email"
        isRequired
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      {mode === "sign-up" && <TextField label="Name" value={name} onChange={setName} />}
      <TextField
        label="Password"
        type="password"
        isRequired
        value={password}
        onChange={setPassword}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        description={mode === "sign-up" ? "At least 8 characters." : undefined}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" isPending={busy}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
      >
        {mode === "sign-up" ? "I already have an account" : "Create an account instead"}
      </Button>
    </form>
  );
}
