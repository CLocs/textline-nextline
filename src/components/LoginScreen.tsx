import { useEffect, useState, type FormEvent } from "react";
import { claimAnonymousPlayer, requestMagicLink, verifyMagicLink } from "../lib/auth/api";
import { getStoredUser, type AuthUser } from "../lib/auth/session";

type Props = {
  initialToken?: string;
  message?: string;
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
};

export function LoginScreen({ initialToken, message, onAuthenticated, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying" | "error">(
    initialToken ? "verifying" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

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
    const result = await requestMagicLink(email);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  const stored = getStoredUser();

  return (
    <section className="panel login-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Back
      </button>

      <h2>Sign in</h2>
      <p className="muted">
        Magic link via email — no password. Stars and shared mini-games attach to your account.
      </p>
      {message && <p className="login-banner" role="status">{message}</p>}

      {status === "verifying" && <p className="muted">Signing you in…</p>}

      {status === "sent" ? (
        <p className="feedback correct" role="status">
          Check your email for a sign-in link. You can close this tab after clicking it.
        </p>
      ) : status !== "verifying" ? (
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
