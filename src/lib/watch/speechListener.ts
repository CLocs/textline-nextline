type RecognitionAlternative = { transcript: string };

type RecognitionResult = {
  isFinal: boolean;
  [index: number]: RecognitionAlternative | undefined;
};

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = { error: string };

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function recognitionConstructor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return recognitionConstructor() !== null;
}

/** A message only when listening cannot continue. Other errors restart. */
export function speechStopReason(code: string): string | null {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "The mic is blocked. Allow the microphone for this site and tap Sync again.";
  }
  if (code === "language-not-supported" || code === "bad-grammar") {
    return "This browser can’t recognize English speech.";
  }
  return null;
}

/** Shown while Sync keeps listening through a hiccup. */
export function speechRetryNotice(code: string): string | null {
  if (code === "network") return "The speech service dropped. Still listening.";
  if (code === "audio-capture") {
    return "No microphone is available. Choose one with the lock icon in the address bar.";
  }
  return null;
}

export type SpeechListener = {
  close: () => void;
};

const RESTART_MS = 300;
const MAX_START_FAILURES = 8;

async function releaseMic(): Promise<void> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) return;
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    /* SpeechRecognition reports a blocked or missing mic. */
  }
}

/**
 * Mic stays on until `close` or a permission failure.
 * Chrome ends a session on its own; that session is started again.
 * Final phrases are match attempts. Interim text is only for the "hearing" line.
 */
export function openSpeechListener(handlers: {
  onPhrase: (phrase: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}): SpeechListener {
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    handlers.onError("This browser has no speech recognition. Open this page in Chrome.");
    return { close() {} };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let closed = false;
  let restartTimer = 0;
  let startFailures = 0;
  let noticed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(restartTimer);
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  const scheduleRestart = () => {
    if (closed) return;
    window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      if (closed) return;
      try {
        recognition.start();
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "InvalidStateError") return;
        startFailures += 1;
        if (startFailures >= MAX_START_FAILURES) {
          close();
          handlers.onError("Listening stopped. Tap Sync to try again.");
          return;
        }
        scheduleRestart();
      }
    }, RESTART_MS);
  };

  recognition.onstart = () => {
    startFailures = 0;
  };

  recognition.onresult = (event) => {
    if (closed) return;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const phrase = result?.[0]?.transcript?.trim() ?? "";
      if (!phrase) continue;
      handlers.onPhrase(phrase, Boolean(result?.isFinal));
    }
  };

  recognition.onerror = (event) => {
    if (closed) return;
    const stop = speechStopReason(event.error);
    if (stop) {
      close();
      handlers.onError(stop);
      return;
    }
    const notice = speechRetryNotice(event.error);
    if (notice && !noticed) {
      noticed = true;
      handlers.onNotice?.(notice);
    }
    scheduleRestart();
  };

  recognition.onend = () => {
    if (closed) return;
    scheduleRestart();
  };

  void releaseMic().then(() => {
    if (closed) return;
    try {
      recognition.start();
    } catch {
      scheduleRestart();
    }
  });

  return { close };
}
