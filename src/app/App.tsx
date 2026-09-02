import { useMemo, useState } from "react";
import type { CatalogEntry, Title } from "../types/content";
import type { GameSetup } from "../components/SetupScreen";
import { getTitle, listCatalogEntries } from "../lib/content/browser";
import { getFirstPlayableLine } from "../lib/content/playable";
import { buildMcq } from "../lib/game/mcq";
import { buildMiniGameQueue } from "../lib/game/miniGame";
import {
  goBackQuestion,
  progressLabel,
  skipQuestion,
  startRun,
  submitAnswer,
  type GameRun,
} from "../lib/game/session";
import { getStarredLineIndices } from "../lib/stars/sync";
import { LibraryScreen } from "../components/LibraryScreen";
import { SetupScreen } from "../components/SetupScreen";
import { PlayScreen } from "../components/PlayScreen";
import { CompleteScreen } from "../components/CompleteScreen";

type Screen = "library" | "setup" | "play" | "complete";

export function App() {
  const entries = useMemo(() => listCatalogEntries(), []);
  const [screen, setScreen] = useState<Screen>("library");
  const [pendingEntry, setPendingEntry] = useState<CatalogEntry | null>(null);
  const [activeEntry, setActiveEntry] = useState<CatalogEntry | null>(null);
  const [lastSetup, setLastSetup] = useState<GameSetup | null>(null);
  const [title, setTitle] = useState<Title | null>(null);
  const [run, setRun] = useState<GameRun | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "skipped" | null>(null);
  const [skipReveal, setSkipReveal] = useState<string | null>(null);

  const question = useMemo(() => {
    if (!title || !run || run.phase !== "playing") return null;
    return buildMcq(title, run.promptLineIndex);
  }, [title, run]);

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

    setActiveEntry(entry);
    setLastSetup(setup);
    setTitle(loaded);
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
    setScreen("play");
  }

  function handlePickEpisode(entry: CatalogEntry) {
    setPendingEntry(entry);
    setScreen("setup");
  }

  function handleChoice(lineIndex: number) {
    if (!title || !run || run.phase !== "playing") return;

    const result = submitAnswer(run, title, lineIndex);
    setRun(result.run);

    if (result.correct) {
      setFeedback("correct");
      if (result.run.phase === "complete") {
        setScreen("complete");
      }
      return;
    }

    setFeedback("wrong");
  }

  function handleSkip() {
    if (!title || !run || run.mode !== "fun") return;

    const result = skipQuestion(run, title);
    if (!result) return;

    setRun(result.run);
    setSkipReveal(result.revealedText);
    setFeedback("skipped");

    if (result.run.phase === "complete") {
      setScreen("complete");
    }
  }

  function handleGoBack() {
    if (!run) return;
    const previous = goBackQuestion(run);
    if (!previous) return;
    setRun(previous);
    setFeedback(null);
    setSkipReveal(null);
  }

  function handleRestart() {
    if (!activeEntry || !lastSetup) return;
    beginGame(activeEntry, lastSetup);
  }

  function handleBackToLibrary() {
    setScreen("library");
    setPendingEntry(null);
    setActiveEntry(null);
    setLastSetup(null);
    setTitle(null);
    setRun(null);
    setFeedback(null);
    setSkipReveal(null);
  }

  return (
    <div className={`app-shell${screen === "play" ? " play-active" : ""}`}>
      <header className="app-header">
        <h1>Textline → Nextline</h1>
        <p className="lede">Here's a line — guess what comes next.</p>
      </header>

      {screen === "library" && <LibraryScreen entries={entries} onSelect={handlePickEpisode} />}

      {screen === "setup" && pendingEntry && (
        <SetupScreen
          entry={pendingEntry}
          onStart={(setup) => beginGame(pendingEntry, setup)}
          onBack={handleBackToLibrary}
        />
      )}

      {screen === "play" && title && run && question && (
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
          onFeedbackDone={() => {
            setFeedback(null);
            setSkipReveal(null);
          }}
        />
      )}

      {screen === "complete" && title && run && (
        <CompleteScreen
          title={title}
          run={run}
          onPlayAgain={handleRestart}
          onBack={handleBackToLibrary}
        />
      )}
    </div>
  );
}
