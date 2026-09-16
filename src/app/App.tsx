import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry, Title } from "../types/content";
import type { GameSetup } from "../components/SetupScreen";
import { getTitle, listCatalogEntries } from "../lib/content/browser";
import { getFirstPlayableLine } from "../lib/content/playable";
import { buildMcq } from "../lib/game/mcq";
import { buildMiniGameQueue, chronologicalPromptQueue } from "../lib/game/miniGame";
import { questionTotal, startRun, submitAnswer, skipQuestion, goBackQuestion, progressLabel, isForgivingMcq, type GameRun } from "../lib/game/session";
import { getStarredLineIndices } from "../lib/stars/sync";
import {
  createMiniShare,
  fetchMe,
  fetchShareMeta,
  fetchShareQueue,
  logout,
  submitSharedRun,
  type ShareMeta,
} from "../lib/auth/api";
import { submitRun } from "../lib/runs/api";
import { clearSession, getStoredUser, isLocalDevSession, type AuthUser } from "../lib/auth/session";
import {
  clearHash,
  consumeLoginReturn,
  isSafeLoginReturn,
  loginReturnFromRoute,
  parseHash,
  peekLoginReturn,
  profileHash,
  rememberLoginReturn,
  setHash,
  type ProfileTab,
} from "../lib/routing/hash";
import { LibraryScreen } from "../components/LibraryScreen";
import { SetupScreen } from "../components/SetupScreen";
import { PlayScreen } from "../components/PlayScreen";
import { CompleteScreen } from "../components/CompleteScreen";
import { CurateScreen } from "../components/CurateScreen";
import { LoginScreen } from "../components/LoginScreen";
import { AuthBar } from "../components/AuthBar";
import { ProfileScreen } from "../components/ProfileScreen";
import { CatalogOpsScreen } from "../components/CatalogOpsScreen";
import { canViewCatalogOps } from "../lib/content/owner";

type Screen = "library" | "setup" | "curate" | "play" | "complete" | "login" | "profile" | "ops";

export function App() {
  const entries = useMemo(() => listCatalogEntries(), []);
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [screen, setScreen] = useState<Screen>(() => (getStoredUser() ? "library" : "login"));
  const [pendingEntry, setPendingEntry] = useState<CatalogEntry | null>(null);
  const [activeEntry, setActiveEntry] = useState<CatalogEntry | null>(null);
  const [lastSetup, setLastSetup] = useState<GameSetup | null>(null);
  const [title, setTitle] = useState<Title | null>(null);
  const [run, setRun] = useState<GameRun | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "skipped" | null>(null);
  const [skipReveal, setSkipReveal] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<GameRun | null>(null);
  const [authToken, setAuthToken] = useState<string | undefined>();
  const [loginMessage, setLoginMessage] = useState<string | undefined>(() =>
    getStoredUser() ? undefined : "Sign in to browse episodes and play.",
  );
  const [loginReturn, setLoginReturn] = useState<string | undefined>(() => {
    const fromHash = loginReturnFromRoute(parseHash());
    if (fromHash) {
      rememberLoginReturn(fromHash);
      return fromHash;
    }
    const route = parseHash();
    if (route.kind === "auth" || route.kind === "login") return peekLoginReturn();
    return undefined;
  });
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [shareMeta, setShareMeta] = useState<ShareMeta | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [persistedRunId, setPersistedRunId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>("account");

  const loginReturnRef = useRef(loginReturn);
  loginReturnRef.current = loginReturn;
  const beginSharedPlayRef = useRef<(shareId: string) => Promise<void>>(async () => {});
  const pendingRunRef = useRef(pendingRun);
  pendingRunRef.current = pendingRun;

  // Rebuild MCQ only when the prompt changes so a miss does not reshuffle choices.
  const question = useMemo(() => {
    if (!title || !run || run.phase !== "playing") return null;
    return buildMcq(title, run.promptLineIndex);
  }, [title, run?.phase, run?.promptLineIndex]);

  function captureLoginReturn(path: string | undefined) {
    if (!isSafeLoginReturn(path)) return;
    setLoginReturn(path);
    rememberLoginReturn(path);
  }

  const handleAuthenticated = useCallback((nextUser: AuthUser) => {
    const route = parseHash();
    const returnTo =
      (isSafeLoginReturn(loginReturnRef.current) ? loginReturnRef.current : undefined) ??
      loginReturnFromRoute(route) ??
      (route.kind === "auth" || route.kind === "login" ? consumeLoginReturn() : undefined);

    setUser(nextUser);
    setLoginReturn(undefined);
    setAuthToken(undefined);
    setLoginMessage(undefined);
    rememberLoginReturn(undefined);

    if (returnTo?.startsWith("play/")) {
      const shareId = returnTo.slice("play/".length);
      clearHash();
      void beginSharedPlayRef.current(shareId);
      return;
    }
    if (returnTo?.startsWith("profile")) {
      setHash(returnTo);
      return;
    }
    if (returnTo === "ops") {
      setHash("ops");
      return;
    }
    clearHash();
    setScreen("library");
  }, []);

  async function beginSharedPlay(shareId: string) {
    setRouteError(null);
    const metaResult = await fetchShareMeta(shareId);
    if ("error" in metaResult) {
      if (metaResult.status === 401) {
        setLoginMessage("Sign in to play this shared mini-game.");
        captureLoginReturn(`play/${shareId}`);
        setScreen("login");
        setHash(`login?return=${encodeURIComponent(`play/${shareId}`)}`);
        return;
      }
      setRouteError(metaResult.error);
      setScreen("library");
      clearHash();
      return;
    }

    const queueResult = await fetchShareQueue(shareId);
    if ("error" in queueResult) {
      if (queueResult.status === 401) {
        setLoginMessage("Sign in to play this shared mini-game.");
        captureLoginReturn(`play/${shareId}`);
        setScreen("login");
        setHash(`login?return=${encodeURIComponent(`play/${shareId}`)}`);
        return;
      }
      setRouteError(queueResult.error);
      setScreen("library");
      clearHash();
      return;
    }

    const loaded = getTitle(queueResult.titleId);
    const entry = entries.find((item) => item.id === queueResult.titleId) ?? null;
    if (!loaded || !entry) {
      setRouteError("Episode for this share is not in the library.");
      setScreen("library");
      clearHash();
      return;
    }

    const questionQueue = chronologicalPromptQueue(
      queueResult.frozen
        ? queueResult.lineIndices
        : buildMiniGameQueue(loaded, {
            personalStarred: queueResult.lineIndices,
            crowdPopular: [],
          }),
    );    const firstPromptLineIndex = questionQueue[0];
    if (firstPromptLineIndex === undefined) {
      setRouteError("This share has no playable starred lines yet.");
      setScreen("library");
      clearHash();
      return;
    }

    setActiveShareId(shareId);
    setShareMeta(metaResult);
    setPendingEntry(entry);
    setActiveEntry(entry);
    setLastSetup({ mode: "fun", length: "mini", crowdPopular: [] });
    setTitle(loaded);
    setPersistedRunId(null);
    setRun(
      startRun(entry.id, {
        mode: "fun",
        length: "mini",
        firstPromptLineIndex,
        questionQueue,
      }),
    );
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
    setScreen("play");
    clearHash();
  }

  beginSharedPlayRef.current = beginSharedPlay;

  useEffect(() => {
    let cancelled = false;

    async function syncUser() {
      if (!getStoredUser()) return;
      if (isLocalDevSession()) return;
      const me = await fetchMe();
      if (cancelled) return;
      if (me) setUser(me);
      else {
        clearSession();
        setUser(null);
        setScreen("login");
        setLoginMessage("Sign in to browse episodes and play.");
      }
    }

    void syncUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function applyRoute() {
      const route = parseHash();
      if (route.kind === "auth") {
        if (user || getStoredUser()) return;
        if (route.returnTo) captureLoginReturn(route.returnTo);
        setAuthToken(route.token);
        setScreen("login");
        return;
      }
      if (route.kind === "login") {
        if (route.returnTo) captureLoginReturn(route.returnTo);
        setScreen("login");
        return;
      }
      if (route.kind === "play") {
        if (!user && !getStoredUser()) {
          setLoginMessage("Sign in to play this shared mini-game.");
          captureLoginReturn(`play/${route.shareId}`);
          setScreen("login");
          setHash(`login?return=${encodeURIComponent(`play/${route.shareId}`)}`);
          return;
        }
        void beginSharedPlay(route.shareId);
        return;
      }
      if (route.kind === "profile") {
        if (!user && !getStoredUser()) {
          setLoginMessage("Sign in to view your profile.");
          captureLoginReturn(profileHash(route.tab));
          setScreen("login");
          return;
        }
        setProfileTab(route.tab);
        setScreen("profile");
        return;
      }
      if (route.kind === "ops") {
        const signedIn = user ?? getStoredUser();
        if (!signedIn) {
          setLoginMessage("Sign in to view the catalog.");
          captureLoginReturn("ops");
          setScreen("login");
          return;
        }
        if (!canViewCatalogOps(signedIn.email, import.meta.env.DEV)) {
          setScreen("library");
          clearHash();
          return;
        }
        setScreen("ops");
      }
    }

    applyRoute();
    window.addEventListener("hashchange", applyRoute);
    return () => window.removeEventListener("hashchange", applyRoute);
    // intentionally depend on user so share links retry after login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, entries]);

  function beginGame(entry: CatalogEntry, setup: GameSetup) {
    const loaded = getTitle(entry.id);
    if (!loaded) return;

    let firstPromptLineIndex: number | undefined;
    let questionQueue: number[] | undefined;

    if (setup.length === "mini") {
      questionQueue = buildMiniGameQueue(loaded, {
        personalStarred: getStarredLineIndices(entry.id),
        crowdPopular: setup.crowdPopular ?? [],
      });
      firstPromptLineIndex = questionQueue[0];
    } else {
      firstPromptLineIndex = getFirstPlayableLine(loaded)?.index;
    }

    if (firstPromptLineIndex === undefined) return;

    setActiveShareId(null);
    setShareMeta(null);
    setActiveEntry(entry);
    setLastSetup(setup);
    setTitle(loaded);
    setPersistedRunId(null);
    setRun(
      startRun(entry.id, {
        mode: setup.mode,
        length: setup.length,
        firstPromptLineIndex,
        questionQueue,
      }),
    );
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
    setScreen("play");
  }

  function handlePickEpisode(entry: CatalogEntry) {
    setPendingEntry(entry);
    setShareMessage(null);
    setScreen("setup");
  }

  function handleChoice(lineIndex: number) {
    if (!title || !run || run.phase !== "playing") return;

    const result = submitAnswer(run, title, lineIndex);

    if (result.correct) {
      setFeedback("correct");
      setPendingRun(result.run);
      return;
    }

    setRun(result.run);
    setFeedback("wrong");
  }

  function handleSkip() {
    if (!title || !run || !isForgivingMcq(run.mode)) return;

    const result = skipQuestion(run, title);
    if (!result) return;

    setSkipReveal(result.revealedText);
    setFeedback("skipped");
    setPendingRun(result.run);
  }

  function handleFeedbackDone() {
    const next = pendingRunRef.current;
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
    if (!next) return;
    setRun(next);
    if (next.phase === "complete") {
      void finishRun(next);
    }
  }

  async function finishRun(completed: GameRun) {
    if (activeShareId) {
      await submitSharedRun(activeShareId, {
        correctCount: completed.correctCount,
        wrongCount: completed.wrongCount,
        skipCount: completed.skipCount,
      });
    }
    if (title && completed.endReason) {
      const ok = await submitRun({
        id: completed.id,
        titleId: completed.titleId,
        length: completed.length,
        mode: completed.mode,
        correctCount: completed.correctCount,
        wrongCount: completed.wrongCount,
        skipCount: completed.skipCount,
        questionTotal: questionTotal(completed, title),
        endReason: completed.endReason,
        shareId: activeShareId,
        questionQueue: completed.questionQueue ?? null,
      });
      setPersistedRunId(ok ? completed.id : null);
    } else {
      setPersistedRunId(null);
    }
    setScreen("complete");
  }

  function handleGoBack() {
    if (!run) return;
    const previous = goBackQuestion(run);
    if (!previous) return;
    setRun(previous);
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
  }

  function handleRestart() {
    if (activeShareId) {
      void beginSharedPlay(activeShareId);
      return;
    }
    if (!activeEntry || !lastSetup) return;
    beginGame(activeEntry, lastSetup);
  }

  function handleBackToLibrary() {
    if (!user) {
      setScreen("login");
      setLoginMessage("Sign in to browse episodes and play.");
      clearHash();
      return;
    }
    setScreen("library");
    setPendingEntry(null);
    setActiveEntry(null);
    setLastSetup(null);
    setTitle(null);
    setRun(null);
    setPersistedRunId(null);
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
    setActiveShareId(null);
    setShareMeta(null);
    setShareMessage(null);
    setRouteError(null);
    clearHash();
  }

  async function handleShareMiniGame() {
    if (!pendingEntry) return;
    if (!user) {
      setLoginMessage("Sign in to create a shareable mini-game link.");
      setLoginReturn(undefined);
      setScreen("login");
      setHash("login");
      return;
    }

    setShareBusy(true);
    setShareMessage(null);
    const result = await createMiniShare(pendingEntry.id);
    setShareBusy(false);
    if ("error" in result) {
      setShareMessage(result.error);
      return;
    }

    try {
      await navigator.clipboard.writeText(result.url);
      setShareMessage(`Link copied: ${result.url}`);
    } catch {
      setShareMessage(result.url);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setPendingEntry(null);
    setActiveEntry(null);
    setLastSetup(null);
    setTitle(null);
    setRun(null);
    setPersistedRunId(null);
    setFeedback(null);
    setSkipReveal(null);
    setPendingRun(null);
    setActiveShareId(null);
    setShareMeta(null);
    setShareMessage(null);
    setRouteError(null);
    setAuthToken(undefined);
    setLoginReturn(undefined);
    setLoginMessage("Sign in to browse episodes and play.");
    setScreen("login");
    clearHash();
  }

  function handleOpenProfile() {
    setProfileTab("account");
    setScreen("profile");
    setHash(profileHash("account"));
  }

  function handleOpenCatalog() {
    setScreen("ops");
    setHash("ops");
  }

  const showCatalog = canViewCatalogOps(user?.email, import.meta.env.DEV);

  // Signed-out users only see the sign-in gate (plus auth deep links).
  const showApp = Boolean(user);

  return (
    <div className={`app-shell${screen === "play" || screen === "curate" ? " play-active" : ""}${screen === "ops" ? " ops-active" : ""}`}>
      <header className="app-header">
        <div className="app-header-row">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true" />
            <div className="brand-copy">
              <h1>Textline → Nextline</h1>
              <p className="lede">Here's a line — guess what comes next.</p>
            </div>
          </div>
          {user && (
            <AuthBar
              user={user}
              onProfile={handleOpenProfile}
              onCatalog={showCatalog ? handleOpenCatalog : undefined}
              onLogout={() => void handleLogout()}
            />
          )}
        </div>
      </header>

      {routeError && (
        <p className="feedback wrong" role="alert">
          {routeError}
        </p>
      )}

      {(!showApp || screen === "login") && (
        <LoginScreen
          initialToken={authToken}
          message={loginMessage}
          returnTo={loginReturn}
          required={!showApp}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {showApp && screen === "library" && (
        <LibraryScreen entries={entries} onSelect={handlePickEpisode} />
      )}

      {showApp && screen === "profile" && user && (
        <ProfileScreen
          user={user}
          tab={profileTab}
          entries={entries}
          onTab={(tab) => {
            setProfileTab(tab);
            setHash(profileHash(tab));
          }}
          onBack={handleBackToLibrary}
          onUpdated={setUser}
        />
      )}

      {showApp && screen === "ops" && user && (
        <CatalogOpsScreen user={user} entries={entries} onBack={handleBackToLibrary} />
      )}

      {showApp && screen === "setup" && pendingEntry && (
        <SetupScreen
          entry={pendingEntry}
          onStart={(setup) => beginGame(pendingEntry, setup)}
          onCurate={() => setScreen("curate")}
          onShareMiniGame={() => void handleShareMiniGame()}
          shareBusy={shareBusy}
          shareMessage={shareMessage}
          onBack={handleBackToLibrary}
        />
      )}

      {showApp && screen === "curate" && pendingEntry && (
        <CurateScreen entry={pendingEntry} onBack={() => setScreen("setup")} />
      )}

      {showApp && screen === "play" && title && run && question && (
        <PlayScreen
          title={title}
          run={run}
          question={question}
          feedback={feedback}
          skipReveal={skipReveal}
          progress={progressLabel(run, title)}
          onChoose={handleChoice}
          onSkip={handleSkip}
          onGoBack={handleGoBack}
          onQuit={handleBackToLibrary}
          onFeedbackDone={handleFeedbackDone}
        />
      )}

      {showApp && screen === "complete" && title && run && (
        <CompleteScreen
          title={title}
          run={run}
          shareId={activeShareId}
          shareOwnerName={shareMeta?.ownerDisplayName}
          persistedRunId={persistedRunId}
          onPlayAgain={handleRestart}
          onBack={handleBackToLibrary}
        />
      )}
    </div>
  );
}
