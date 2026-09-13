import { useEffect, useRef, useState } from "react";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "continue_with" | "signup_with";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

type Props = {
  clientId: string;
  disabled?: boolean;
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
};

export function GoogleSignInButton({ clientId, disabled, onCredential, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      try {
        await loadGisScript();
        if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;

        hostRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const token = response.credential?.trim();
            if (!token) {
              onError?.("Google did not return a credential");
              return;
            }
            onCredential(token);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(hostRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : "Google Sign-In unavailable");
        }
      }
    }

    void mount();
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, onError]);

  return (
    <div
      className={`google-signin${disabled ? " disabled" : ""}`}
      aria-busy={!ready}
      aria-disabled={disabled || undefined}
    >
      <div ref={hostRef} className="google-signin-host" />
    </div>
  );
}
