import { useEffect, useState } from "react";
import {
  dismissInstallHelper,
  getDeferredInstallPrompt,
  isIosSafari,
  isMobileInstallCandidate,
  isStandaloneDisplay,
  promptNativeInstall,
  wasInstallDismissed,
} from "../lib/pwa/install";

type Variant = "android" | "ios" | null;

function resolveVariant(): Variant {
  if (isStandaloneDisplay() || wasInstallDismissed() || !isMobileInstallCandidate()) return null;
  if (isIosSafari()) return "ios";
  // Android / Chromium: show when BIP is available, or after a short wait so the event can arrive.
  if (getDeferredInstallPrompt()) return "android";
  return "android";
}

export function PwaInstallHelper() {
  const [variant, setVariant] = useState<Variant>(() => resolveVariant());
  const [busy, setBusy] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(() => Boolean(getDeferredInstallPrompt()));

  useEffect(() => {
    function refresh() {
      setHasPrompt(Boolean(getDeferredInstallPrompt()));
      setVariant(resolveVariant());
    }
    refresh();
    window.addEventListener("tlnl-pwa-prompt-ready", refresh);
    return () => window.removeEventListener("tlnl-pwa-prompt-ready", refresh);
  }, []);

  if (!variant) return null;

  // Android without a deferred prompt yet: wait quietly (Chrome may fire late).
  if (variant === "android" && !hasPrompt) return null;

  function handleDismiss() {
    dismissInstallHelper();
    setVariant(null);
  }

  async function handleInstall() {
    setBusy(true);
    const outcome = await promptNativeInstall();
    setBusy(false);
    if (outcome === "accepted") {
      dismissInstallHelper();
      setVariant(null);
      return;
    }
    if (outcome === "dismissed") {
      dismissInstallHelper();
      setVariant(null);
      return;
    }
    setHasPrompt(false);
  }

  return (
    <aside className="pwa-install" role="region" aria-label="Add to home screen">
      <div className="pwa-install-copy">
        <p className="pwa-install-title">Add Textline to your home screen</p>
        {variant === "ios" ? (
          <ol className="pwa-install-steps">
            <li>
              Tap <strong>Share</strong>
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>
            </li>
          </ol>
        ) : (
          <p className="muted pwa-install-lede">Open it like an app — no browser chrome.</p>
        )}
      </div>
      <div className="pwa-install-actions">
        {variant === "android" ? (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void handleInstall()}
          >
            {busy ? "Opening…" : "Install"}
          </button>
        ) : null}
        <button type="button" className="button ghost" onClick={handleDismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
