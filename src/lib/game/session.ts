import {
  countPlayableQuestions,
  getNextPlayableLine,
  playableQuestionNumber,
  type LineSource,
} from "../content/playable.js";
import type { GameMode } from "../../types/game.js";

export type GamePhase = "playing" | "complete";

export type EndReason = "finished" | "miss";

export type HistoryVia = "start" | "correct" | "skip" | "incorrect";

export type HistoryEntry = {
  lineIndex: number;
  via: HistoryVia;
};

export type GameRun = {
  titleId: string;
  mode: GameMode;
  promptLineIndex: number;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  history: HistoryEntry[];
  phase: GamePhase;
  endReason?: EndReason;
};

export function startRun(titleId: string, mode: GameMode, firstPromptLineIndex: number): GameRun {
  return {
    titleId,
    mode,
    promptLineIndex: firstPromptLineIndex,
    correctCount: 0,
    wrongCount: 0,
    skipCount: 0,
    history: [{ lineIndex: firstPromptLineIndex, via: "start" }],
    phase: "playing",
  };
}

export type AnswerResult = {
  run: GameRun;
  correct: boolean;
};

export type SkipResult = {
  run: GameRun;
  revealedText: string;
};

function completeRun(run: GameRun, updates: Partial<GameRun>): GameRun {
  return { ...run, ...updates, phase: "complete", endReason: "finished" };
}

function missRun(run: GameRun): GameRun {
  return { ...run, phase: "complete", endReason: "miss" };
}

function appendHistory(run: GameRun, lineIndex: number, via: HistoryVia): HistoryEntry[] {
  const last = run.history[run.history.length - 1];
  if (last?.lineIndex === lineIndex) return run.history;
  return [...run.history, { lineIndex, via }];
}

function appendWrongGuess(run: GameRun, selectedLineIndex: number): GameRun {
  const last = run.history[run.history.length - 1];
  if (last?.lineIndex === selectedLineIndex && last.via === "incorrect") {
    return { ...run, wrongCount: run.wrongCount + 1 };
  }
  return {
    ...run,
    wrongCount: run.wrongCount + 1,
    history: [...run.history, { lineIndex: selectedLineIndex, via: "incorrect" }],
  };
}

export function submitAnswer(
  run: GameRun,
  source: LineSource,
  selectedLineIndex: number,
): AnswerResult {
  if (run.phase === "complete") {
    return { run, correct: false };
  }

  const correctLine = getNextPlayableLine(source, run.promptLineIndex);
  if (!correctLine) {
    return { run: completeRun(run, {}), correct: false };
  }

  if (selectedLineIndex !== correctLine.index) {
    if (run.mode !== "fun") {
      return {
        run: missRun({
          ...run,
          wrongCount: run.wrongCount + 1,
          history: appendHistory(run, correctLine.index, "incorrect"),
        }),
        correct: false,
      };
    }
    return {
      run: appendWrongGuess(run, selectedLineIndex),
      correct: false,
    };
  }

  const correctCount = run.correctCount + 1;
  const history = appendHistory(run, correctLine.index, "correct");
  const hasAnotherQuestion = getNextPlayableLine(source, correctLine.index) !== undefined;

  if (!hasAnotherQuestion) {
    return {
      run: completeRun(run, {
        promptLineIndex: correctLine.index,
        correctCount,
        history,
      }),
      correct: true,
    };
  }

  return {
    run: {
      ...run,
      promptLineIndex: correctLine.index,
      correctCount,
      history,
    },
    correct: true,
  };
}

export function skipQuestion(run: GameRun, source: LineSource): SkipResult | null {
  if (run.phase !== "playing" || run.mode !== "fun") return null;

  const correctLine = getNextPlayableLine(source, run.promptLineIndex);
  if (!correctLine) {
    return {
      run: completeRun(run, { skipCount: run.skipCount + 1 }),
      revealedText: "",
    };
  }

  const history = appendHistory(run, correctLine.index, "skip");
  const hasAnotherQuestion = getNextPlayableLine(source, correctLine.index) !== undefined;

  if (!hasAnotherQuestion) {
    return {
      run: completeRun(run, {
        promptLineIndex: correctLine.index,
        skipCount: run.skipCount + 1,
        history,
      }),
      revealedText: correctLine.text,
    };
  }

  return {
    run: {
      ...run,
      promptLineIndex: correctLine.index,
      skipCount: run.skipCount + 1,
      history,
    },
    revealedText: correctLine.text,
  };
}

export function progressLabel(run: GameRun, source: LineSource): string {
  const total = countPlayableQuestions(source);
  if (run.phase === "complete") {
    if (run.endReason === "miss") {
      return `Stopped at question ${playableQuestionNumber(source, run.promptLineIndex)}`;
    }
    return `Finished — ${run.correctCount} / ${total}`;
  }
  const current = playableQuestionNumber(source, run.promptLineIndex);
  return `Question ${current} of ${total}`;
}
