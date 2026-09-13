import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  claimAnonymousPlayer,
  fetchAuthConfig,
  requestMagicLink,
  signInWithGoogleIdToken,
  verifyMagicLink,
} from "../lib/auth/api";
import {
  getStoredUser,
  setLocalDevUser,
  type AuthUser,
} from "../lib/auth/session";
import { GoogleSignInButton } from "./GoogleSignInButton";

type Props = {
  initialToken?: string;
  message?: string;
  /** Hash path to resume after sign-in, e.g. play/abc */
  returnTo?: string;
  /** When true, this is the app gate — no back to library. */
  required?: boolean;
  onAuthenticated: (user: AuthUser) => void;
  onBack?: () => void;
};

export function LoginScreen({
  initialToken,
  message,
  returnTo,
  required = false,
  onAuthenticated,
  onBack,
}: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying" | "error">(
    initialToken ? "verifying" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig().then((config) => {
      if (!cancelled) setGoogleClientId(config.googleClientId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;

    async function verify() {
      setStatus("verifying");
      const result = await verifyMagicLink(initialToken!);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      await claimAnonymousPlayer();
      if (cancelled) return;
      onAuthenticated(result.user);
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [initialToken, onAuthenticated]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("sending");
    const result = await requestMagicLink(email, returnTo);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError(null);
      setStatus("verifying");
      const result = await signInWithGoogleIdToken(idToken);
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      await claimAnonymousPlayer();
      onAuthenticated(result.user);
    },
    [onAuthenticated],
  );

  const handleGoogleError = useCallback((message: string) => {
    setError(message);
    setStatus("error");
  }, []);

  function continueLocalDev() {
    const user: AuthUser = {
      id: "local-dev",
      email: "local@dev",
      displayName: "Local",
      createdAt: new Date().toISOString(),
    };
    setLocalDevUser(user);
    onAuthenticated(user);
  }

  const stored = getStoredUser();
  const showForm = status !== "verifying" && status !== "sent";

  return (
    <section className="panel login-panel">
      {!required && onBack && (
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Back
        </button>
      )}

      <h2>Sign in</h2>
      <p className="muted">
        Continue with Google, or email a magic link — no password. Your stars and shared mini-games
        attach to this account.
      </p>
      {message && <p className="login-banner" role="status">{message}</p>}

      {status === "verifying" && <p className="muted">Signing you in…</p>}

      {status === "sent" ? (
        <div role="status">
          <p className="feedback correct">Check your email for a sign-in link.</p>
          <p className="muted login-hint">
            If you don’t see it, check spam/junk — links from new senders often land there until the
            domain is warmed up. On localhost, the link should open this same origin once the API is
            redeployed with origin-aware magic links.
          </p>
        </div>
      ) : null}

      {showForm && googleClientId && (
        <div className="login-google">
          <GoogleSignInButton
            clientId={googleClientId}
            disabled={status === "sending"}
            onCredential={(token) => void handleGoogleCredential(token)}
            onError={handleGoogleError}
          />
          <p className="login-divider muted" role="separator">
            or
          </p>
        </div>
      )}

      {showForm ? (
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" className="button primary" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </form>
      ) : null}

      {import.meta.env.DEV && status !== "verifying" && (
        <button type="button" className="button ghost local-dev-continue" onClick={continueLocalDev}>
          Continue without signing in (local only)
        </button>
      )}

      {error && (
        <p className="feedback wrong" role="alert">
          {error}
        </p>
      )}

      {stored && status === "idle" && (
        <p className="muted login-hint">Previously signed in as {stored.email} on this device.</p>
      )}
    </section>
  );
}
