import { useEffect, useState } from "react";
import { isAuthApiEnabled, fetchDailyMailPreference, setDailyMailPreference } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";

const ASKED_KEY = "tlnl-daily-mail-asked";

function alreadyAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

function rememberAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Private mode can refuse storage. The dialog still closes for this view.
  }
}

/** One ask, after a finished game. Login stays quiet. */
export function DailyMailPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthApiEnabled() || isLocalDevSession() || alreadyAsked()) return;
    let cancelled = false;
    void fetchDailyMailPreference().then((result) => {
      if (cancelled) return;
      if ("error" in result) return;
      if (result.optedIn) {
        rememberAsked();
        return;
      }
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    rememberAsked();
    setOpen(false);
  }

  async function accept() {
    setBusy(true);
    setError(null);
    const result = await setDailyMailPreference(true);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    close();
  }

  if (!open) return null;

  return (
    <div className="teach-dialog-backdrop" role="presentation">
      <div className="teach-dialog daily-mail-prompt" role="dialog" aria-modal="true" aria-labelledby="daily-mail-prompt-title">
        <h3 id="daily-mail-prompt-title">Email you today’s three?</h3>
        <p className="muted">
          One email each morning, after you’ve played. Tap a card to open that question. You can turn it off anytime in Profile.
        </p>
        {error ? (
          <p className="feedback wrong" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row">
          <button type="button" className="button primary" disabled={busy} onClick={() => void accept()}>
            {busy ? "Saving…" : "Email me"}
          </button>
          <button type="button" className="button ghost" disabled={busy} onClick={close}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
