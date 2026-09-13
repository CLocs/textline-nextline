export function isPerfectScore(run: {
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
}): boolean {
  return (
    run.questionTotal > 0 &&
    run.correctCount === run.questionTotal &&
    run.wrongCount === 0 &&
    run.skipCount === 0
  );
}

export type CohortPlayer = {
  displayName: string;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
};

export function cohortSummary(players: CohortPlayer[], questionTotal: number): string | null {
  if (players.length === 0) return null;
  const bits = players.map((player) => `${player.displayName} ${player.correctCount}/${questionTotal}`);
  let line = bits.join(" · ");
  const perfectCount = players.filter((player) =>
    isPerfectScore({ ...player, questionTotal }),
  ).length;
  if (players.length >= 2 && perfectCount === players.length) {
    line += players.length === 2 ? " — both perfect" : ` — ${players.length} perfect`;
  }
  return line;
}
