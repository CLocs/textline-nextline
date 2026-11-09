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

function errorMessage(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "The mic is blocked. Allow the microphone and tap Sync again.";
  }
  if (code === "audio-capture") return "No microphone is available.";
  return "Listening stopped. Tap Sync to try again.";
}

export type SpeechListener = {
  close: () => void;
};

/**
 * Mic stays on until `close`. Final phrases are match attempts.
 * Interim text is only for the "hearing" line.
 */
export function openSpeechListener(handlers: {
  onPhrase: (phrase: string, isFinal: boolean) => void;
  onError: (message: string) => void;
}): SpeechListener {
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    handlers.onError("This browser has no speech recognition.");
    return { close() {} };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let closed = false;
  let restartTimer = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(restartTimer);
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
    if (event.error === "no-speech" || event.error === "aborted") return;
    close();
    handlers.onError(errorMessage(event.error));
  };

  recognition.onend = () => {
    if (closed) return;
    restartTimer = window.setTimeout(() => {
      if (closed) return;
      try {
        recognition.start();
      } catch {
        close();
        handlers.onError("Listening stopped. Tap Sync to try again.");
      }
    }, 200);
  };

  try {
    recognition.start();
  } catch {
    close();
    handlers.onError("The mic did not start. Tap Sync to try again.");
  }

  return { close };
}
