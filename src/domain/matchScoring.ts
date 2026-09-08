export type MatchFormat = 1 | 3 | 5;

export type SetScore = {
  participantA: number | null;
  participantB: number | null;
};

export type MatchWinner = "participantAWin" | "participantBWin";

export function getSetCount(matchFormat: MatchFormat | undefined): number {
  return matchFormat === 3 || matchFormat === 5 ? matchFormat : 1;
}

export function createEmptySetScores(matchFormat: MatchFormat | undefined): SetScore[] {
  return Array.from({ length: getSetCount(matchFormat) }, () => ({ participantA: null, participantB: null }));
}

export function normalizeSetScores(value: unknown, matchFormat: MatchFormat | undefined): SetScore[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: getSetCount(matchFormat) }, (_, index) => {
    const item = source[index];
    if (!item || typeof item !== "object") return { participantA: null, participantB: null };
    const score = item as Partial<SetScore>;
    return {
      participantA: normalizeScore(score.participantA),
      participantB: normalizeScore(score.participantB),
    };
  });
}

export function inferMatchWinnerFromSetScores(
  matchFormat: MatchFormat,
  setScores: readonly SetScore[] | undefined,
): MatchWinner | undefined {
  const setsToWin = Math.floor(matchFormat / 2) + 1;
  let participantAWins = 0;
  let participantBWins = 0;

  for (const score of setScores ?? []) {
    if (score.participantA === null || score.participantB === null) continue;
    if (score.participantA > score.participantB) participantAWins += 1;
    if (score.participantB > score.participantA) participantBWins += 1;
  }

  if (participantAWins >= setsToWin) return "participantAWin";
  if (participantBWins >= setsToWin) return "participantBWin";
  return undefined;
}

export function hasEnteredSetScore(value: readonly SetScore[] | undefined): boolean {
  return value?.some((score) => score.participantA !== null || score.participantB !== null) ?? false;
}

function normalizeScore(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
