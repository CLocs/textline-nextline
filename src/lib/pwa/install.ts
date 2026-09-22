const DISMISS_KEY = "tlnl-pwa-install-dismissed";

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEventLike | null = null;
let listenersAttached = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isStandaloneDisplay(): boolean {
  if (!isBrowser()) return false;
  const media = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(media || iosStandalone);
}

export function isIosSafari(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua);
  // iOS Chrome/Firefox etc. also lack BIP; treat touch iOS as iOS path when not standalone.
  if (iOS && /CriOS|FxiOS|EdgiOS/.test(ua)) return true;
  return iOS && webkit && (notOther || /Safari/.test(ua));
}

export function isMobileInstallCandidate(): boolean {
  if (!isBrowser() || isStandaloneDisplay()) return false;
  if (isIosSafari()) return true;
  return /Android/i.test(navigator.userAgent);
}

export function wasInstallDismissed(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallHelper(): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEventLike | null {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt(): void {
  deferredPrompt = null;
}

/** Capture beforeinstallprompt as early as possible (call once from app boot). */
export function attachInstallPromptListener(): void {
  if (!isBrowser() || listenersAttached) return;
  listenersAttached = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEventLike;
    window.dispatchEvent(new Event("tlnl-pwa-prompt-ready"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    dismissInstallHelper();
  });
}

export async function promptNativeInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return "unavailable";
  deferredPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  return choice.outcome;
}
