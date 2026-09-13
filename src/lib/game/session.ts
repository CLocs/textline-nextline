import {
  countPlayableQuestions,
  getNextPlayableLine,
  playableQuestionNumber,
  type LineSource,
} from "../content/playable.js";
import type { GameLength, GameMode } from "../../types/game.js";

export type GamePhase = "playing" | "complete";

export type EndReason = "finished" | "miss";

export type HistoryVia = "start" | "correct" | "reguess" | "skip" | "incorrect" | "prompt";

export type HistoryEntry = {
  lineIndex: number;
  via: HistoryVia;
};

export type RevertFrame = {
  promptLineIndex: number;
  questionIndex: number;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  scoreCredit: number;
  questionWrongCount: number;
  historyLength: number;
};

export type GameRun = {
  id: string;
  titleId: string;
  mode: GameMode;
  length: GameLength;
  promptLineIndex: number;
  questionQueue?: number[];
  questionIndex: number;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  /** Weighted Fun-mode score: 1 / 0.5 / 0.25 by attempt. */
  scoreCredit: number;
  /** Wrong answers on the current prompt (resets when the question advances). */
  questionWrongCount: number;
  history: HistoryEntry[];
  revertStack: RevertFrame[];
  phase: GamePhase;
  endReason?: EndReason;
};

export type StartRunOptions = {
  mode: GameMode;
  length: GameLength;
  firstPromptLineIndex: number;
  questionQueue?: number[];
};

export function createRunId(): string {
  return crypto.randomUUID();
}

export function startRun(titleId: string, options: StartRunOptions): GameRun {
  const { mode, length, firstPromptLineIndex, questionQueue } = options;
  return {
    id: createRunId(),
    titleId,
    mode,
    length,
    promptLineIndex: firstPromptLineIndex,
    questionQueue,
    questionIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    skipCount: 0,
    scoreCredit: 0,
    questionWrongCount: 0,
    history: [{ lineIndex: firstPromptLineIndex, via: "start" }],
    revertStack: [],
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

function wrongsOnCurrentQuestion(run: GameRun): number {
  return run.questionWrongCount;
}

/** Credit for a correct answer: 1st try 1, 2nd try 0.5, 3rd+ 0.25. */
export function creditForPriorWrongs(priorWrongs: number): number {
  if (priorWrongs <= 0) return 1;
  if (priorWrongs === 1) return 0.5;
  return 0.25;
}

function appendHistory(run: GameRun, lineIndex: number, via: HistoryVia): HistoryEntry[] {
  const last = run.history[run.history.length - 1];
  if (last?.lineIndex === lineIndex && last.via === via) return run.history;
  return [...run.history, { lineIndex, via }];
}

function appendWrongGuess(run: GameRun, selectedLineIndex: number): GameRun {
  const last = run.history[run.history.length - 1];
  const questionWrongCount = run.questionWrongCount + 1;
  if (last?.lineIndex === selectedLineIndex && last.via === "incorrect") {
    return {
      ...run,
      wrongCount: run.wrongCount + 1,
      questionWrongCount,
    };
  }
  return {
    ...run,
    wrongCount: run.wrongCount + 1,
    questionWrongCount,
    history: [...run.history, { lineIndex: selectedLineIndex, via: "incorrect" }],
  };
}

function totalQuestions(run: GameRun, source: LineSource): number {
  if (run.length === "mini" && run.questionQueue) {
    return run.questionQueue.length;
  }
  return countPlayableQuestions(source);
}

function pushRevertFrame(run: GameRun): RevertFrame[] {
  return [
    ...run.revertStack,
    {
      promptLineIndex: run.promptLineIndex,
      questionIndex: run.questionIndex,
      correctCount: run.correctCount,
      wrongCount: run.wrongCount,
      skipCount: run.skipCount,
      scoreCredit: run.scoreCredit,
      questionWrongCount: run.questionWrongCount,
      historyLength: run.history.length,
    },
  ];
}

function advanceAfterReveal(
  run: GameRun,
  source: LineSource,
  correctLineIndex: number,
  history: HistoryEntry[],
  updates: Partial<GameRun>,
): GameRun {
  const revertStack = pushRevertFrame(run);
  const nextUpdates = { ...updates, questionWrongCount: 0 };

  if (run.length === "mini" && run.questionQueue) {
    const nextQuestionIndex = run.questionIndex + 1;
    if (nextQuestionIndex >= run.questionQueue.length) {
      return completeRun(run, {
        ...nextUpdates,
        promptLineIndex: correctLineIndex,
        history,
        questionIndex: nextQuestionIndex,
        revertStack,
      });
    }

    const nextPrompt = run.questionQueue[nextQuestionIndex]!;
    return {
      ...run,
      ...nextUpdates,
      promptLineIndex: nextPrompt,
      questionIndex: nextQuestionIndex,
      history: appendHistory({ ...run, history }, nextPrompt, "prompt"),
      revertStack,
    };
  }

  const hasAnotherQuestion = getNextPlayableLine(source, correctLineIndex) !== undefined;
  if (!hasAnotherQuestion) {
    return completeRun(run, {
      ...nextUpdates,
      promptLineIndex: correctLineIndex,
      history,
      revertStack,
    });
  }

  return {
    ...run,
    ...nextUpdates,
    promptLineIndex: correctLineIndex,
    history,
    revertStack,
  };
}

export function canGoBack(run: GameRun): boolean {
  return run.mode === "fun" && run.phase === "playing" && run.revertStack.length > 0;
}

export function goBackQuestion(run: GameRun): GameRun | null {
  if (!canGoBack(run)) return null;

  const frame = run.revertStack[run.revertStack.length - 1]!;
  return {
    ...run,
    promptLineIndex: frame.promptLineIndex,
    questionIndex: frame.questionIndex,
    correctCount: frame.correctCount,
    wrongCount: frame.wrongCount,
    skipCount: frame.skipCount,
    scoreCredit: frame.scoreCredit,
    questionWrongCount: frame.questionWrongCount,
    history: run.history.slice(0, frame.historyLength),
    revertStack: run.revertStack.slice(0, -1),
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

  const priorWrongs = wrongsOnCurrentQuestion(run);
  const credit = creditForPriorWrongs(priorWrongs);
  const via: HistoryVia = priorWrongs === 0 ? "correct" : "reguess";
  const correctCount = run.correctCount + 1;
  const scoreCredit = run.scoreCredit + credit;
  const history = appendHistory(run, correctLine.index, via);

  return {
    run: advanceAfterReveal(run, source, correctLine.index, history, {
      correctCount,
      scoreCredit,
    }),
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
  const skipCount = run.skipCount + 1;

  return {
    run: advanceAfterReveal(run, source, correctLine.index, history, { skipCount }),
    revealedText: correctLine.text,
  };
}

export function progressLabel(run: GameRun, source: LineSource): string {
  const total = totalQuestions(run, source);
  if (run.phase === "complete") {
    if (run.endReason === "miss") {
      if (run.length === "mini") {
        return `Stopped at question ${run.questionIndex + 1}`;
      }
      return `Stopped at question ${playableQuestionNumber(source, run.promptLineIndex)}`;
    }
    return `Finished — ${run.correctCount} / ${total}`;
  }

  if (run.length === "mini") {
    return `Question ${run.questionIndex + 1} of ${total}`;
  }

  const current = playableQuestionNumber(source, run.promptLineIndex);
  return `Question ${current} of ${total}`;
}

export function questionTotal(run: GameRun, source: LineSource): number {
  return totalQuestions(run, source);
}
