import type {
  DrawSize,
  DrawSlot,
  Entrant,
  GeneratedDraw,
  ResolvedTournamentMatch,
  TournamentMatch,
  TournamentMatchResult,
  TournamentMatchSource,
} from "./types";
import {
  createEmptySetScores,
  inferMatchWinnerFromSetScores,
  normalizeSetScores,
  type MatchFormat,
} from "./matchScoring";

type SourceResolution = {
  resolved: boolean;
  entrantId?: string;
};

export function createTournamentMatches(
  slots: readonly DrawSlot[],
  drawSize: DrawSize,
  createId?: () => string,
  matchFormat: MatchFormat = 1,
): TournamentMatch[] {
  const rounds = Math.log2(drawSize);
  const matches: TournamentMatch[] = [];
  const previousRound: TournamentMatch[] = [];
  let generatedId = 0;
  const nextId = createId ?? (() => `match-${++generatedId}`);

  for (let round = 1; round <= rounds; round += 1) {
    const matchCount = drawSize / 2 ** round;
    const currentRound: TournamentMatch[] = [];

    for (let matchNo = 1; matchNo <= matchCount; matchNo += 1) {
      const match: TournamentMatch = {
        id: nextId(),
        round,
        matchNo,
        sourceA: round === 1
          ? { slotPosition: slots[(matchNo - 1) * 2]?.position ?? (matchNo - 1) * 2 + 1 }
          : { matchId: previousRound[(matchNo - 1) * 2]?.id ?? "" },
        sourceB: round === 1
          ? { slotPosition: slots[(matchNo - 1) * 2 + 1]?.position ?? (matchNo - 1) * 2 + 2 }
          : { matchId: previousRound[(matchNo - 1) * 2 + 1]?.id ?? "" },
        result: "unplayed",
        setScores: createEmptySetScores(matchFormat),
      };
      currentRound.push(match);
      matches.push(match);
    }

    previousRound.splice(0, previousRound.length, ...currentRound);
  }

  return matches;
}

export function resolveTournamentMatches(
  draw: GeneratedDraw,
  entrants: readonly Entrant[],
): ResolvedTournamentMatch[] {
  const matches = draw.matches ?? createTournamentMatches(draw.slots, draw.slots.length as DrawSize);
  const slotsByPosition = new Map(draw.slots.map((slot) => [slot.position, slot]));
  const resolvedById = new Map<string, ResolvedTournamentMatch>();

  return [...matches]
    .sort(compareMatches)
    .map((match) => {
      const participantA = resolveSource(match.sourceA, slotsByPosition, resolvedById);
      const participantB = resolveSource(match.sourceB, slotsByPosition, resolvedById);
      const participantsReady = participantA.resolved && participantB.resolved;
      const participantIds = [participantA.entrantId, participantB.entrantId].filter(
        (entrantId): entrantId is string => Boolean(entrantId),
      );
      const hasTwoParticipants = participantIds.length === 2
        && participantIds[0] !== participantIds[1]
        && (entrants.length === 0 || participantIds.every((entrantId) => entrants.some((entrant) => entrant.id === entrantId)));
      const result = hasTwoParticipants && isWinResult(match.result) ? match.result : "unplayed";
      const state = !participantsReady || !hasTwoParticipants && participantIds.length !== 1
        ? "pending"
        : participantIds.length === 1
          ? "byeAdvance"
          : hasTwoParticipants && result !== "unplayed"
            ? "completed"
            : "ready";
      const winnerEntrantId = state === "byeAdvance"
        ? participantIds[0]
        : state === "completed"
          ? result === "participantAWin" ? participantA.entrantId : participantB.entrantId
          : undefined;
      const resolved: ResolvedTournamentMatch = {
        ...match,
        result,
        state,
        participantAId: participantA.entrantId,
        participantBId: participantB.entrantId,
        winnerEntrantId,
      };

      resolvedById.set(match.id, resolved);
      return resolved;
    });
}

export function updateTournamentMatch(
  draw: GeneratedDraw,
  matchId: string,
  patch: Pick<TournamentMatch, "result"> & Partial<Pick<TournamentMatch, "note" | "setScores">>,
  matchFormat: MatchFormat = 1,
): GeneratedDraw {
  const matches = draw.matches ?? createTournamentMatches(draw.slots, draw.slots.length as DrawSize, undefined, matchFormat);
  const current = matches.find((match) => match.id === matchId);
  if (!current) {
    throw new RangeError(`Tournament match not found: ${matchId}`);
  }

  const currentResolved = resolveTournamentMatches({ ...draw, matches }, []);
  const currentMatch = currentResolved.find((match) => match.id === matchId);
  if (!currentMatch) {
    throw new RangeError(`Tournament match not found: ${matchId}`);
  }
  if (currentMatch.state !== "ready" && currentMatch.state !== "completed") {
    throw new RangeError("Only a match with two confirmed participants can receive a result.");
  }

  const nextMatches = matches.map((match) => match.id === matchId
    ? {
        ...match,
        result: patch.result,
        note: patch.note?.trim() ? patch.note : undefined,
        ...(patch.setScores ? { setScores: normalizeSetScores(patch.setScores, matchFormat) } : {}),
      }
    : { ...match });
  const baselineById = new Map(currentResolved.map((match) => [match.id, match]));

  for (const round of [...new Set(nextMatches.map((match) => match.round))].sort((a, b) => a - b)) {
    const resolved = resolveTournamentMatches({ ...draw, matches: nextMatches }, []);
    for (const match of nextMatches.filter((item) => item.round === round && item.id !== matchId)) {
      const before = baselineById.get(match.id);
      const after = resolved.find((item) => item.id === match.id);
      if (!before || !after || before.participantAId === after.participantAId && before.participantBId === after.participantBId) {
        continue;
      }
      match.result = "unplayed";
      delete match.note;
      match.setScores = createEmptySetScores(matchFormat);
    }
  }

  return { ...draw, matches: nextMatches };
}

export function updateTournamentMatchSetScore(
  draw: GeneratedDraw,
  matchId: string,
  matchFormat: MatchFormat,
  setIndex: number,
  participant: "participantA" | "participantB",
  value: number | null,
): GeneratedDraw {
  const matches = draw.matches ?? createTournamentMatches(draw.slots, draw.slots.length as DrawSize, undefined, matchFormat);
  const current = matches.find((match) => match.id === matchId);
  if (!current) {
    throw new RangeError(`Tournament match not found: ${matchId}`);
  }

  const resolved = resolveTournamentMatches({ ...draw, matches }, []);
  const currentResolved = resolved.find((match) => match.id === matchId);
  if (!currentResolved || (currentResolved.state !== "ready" && currentResolved.state !== "completed")) {
    throw new RangeError("Only a match with two confirmed participants can receive a score.");
  }

  const setScores = normalizeSetScores(current.setScores, matchFormat);
  if (setIndex < 0 || setIndex >= setScores.length) return { ...draw, matches };
  setScores[setIndex] = { ...setScores[setIndex], [participant]: normalizeScoreValue(value) };

  const inferredResult = current.result === "unplayed"
    ? inferMatchWinnerFromSetScores(matchFormat, setScores)
    : undefined;

  return updateTournamentMatch(
    { ...draw, matches },
    matchId,
    {
      result: inferredResult ?? current.result,
      setScores,
      note: current.note,
    },
    matchFormat,
  );
}

function resolveSource(
  source: TournamentMatchSource,
  slotsByPosition: ReadonlyMap<number, DrawSlot>,
  matchesById: ReadonlyMap<string, ResolvedTournamentMatch>,
): SourceResolution {
  if ("slotPosition" in source) {
    const slot = slotsByPosition.get(source.slotPosition);
    if (!slot) {
      return { resolved: false };
    }
    return slot.isBye || Boolean(slot.entrantId)
      ? { resolved: true, entrantId: slot.entrantId }
      : { resolved: false };
  }

  const match = matchesById.get(source.matchId);
  if (!match || (match.state !== "completed" && match.state !== "byeAdvance")) {
    return { resolved: false };
  }
  return { resolved: true, entrantId: match.winnerEntrantId };
}

function isWinResult(result: TournamentMatchResult): result is Exclude<TournamentMatchResult, "unplayed"> {
  return result === "participantAWin" || result === "participantBWin";
}

function normalizeScoreValue(value: number | null): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function compareMatches(left: TournamentMatch, right: TournamentMatch): number {
  return left.round - right.round || left.matchNo - right.matchNo;
}
