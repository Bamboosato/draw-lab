import {
  createEmptySetScores,
  type League,
  type LeagueGroup,
  type LeagueMatch,
  type LeagueMatchResult,
  type LeagueParticipant,
  type LeagueScoringPolicy,
  type LeagueSetScore,
  type LeagueStanding,
  type LeagueValidationIssue,
  type LeagueValidationResult,
  type MatchFormat,
} from "./leagueTypes";

export const DEFAULT_LEAGUE_SCORING_POLICY: LeagueScoringPolicy = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
};

export function inferMatchWinnerFromSetScores(
  matchFormat: MatchFormat,
  setScores: readonly LeagueSetScore[] | undefined,
): Extract<LeagueMatchResult, "participantAWin" | "participantBWin"> | undefined {
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

export function isLeagueParticipantEmpty(participant: LeagueParticipant): boolean {
  return [
    participant.displayName,
    ...participant.memberNames,
    participant.team,
    participant.region,
    participant.note,
  ].every((value) => !value?.trim());
}

export function createCandidateMatches(groups: readonly LeagueGroup[], createId: () => string, matchFormat: MatchFormat = 1): LeagueMatch[] {
  let order = 1;
  const matches: LeagueMatch[] = [];

  for (const group of groups) {
    for (const [leftIndex, rightIndex] of createMatchPairings(group.participantIds.length)) {
      matches.push({
        id: createId(),
        groupId: group.id,
        order,
        participantAId: group.participantIds[leftIndex]!,
        participantBId: group.participantIds[rightIndex]!,
        isValid: true,
        result: "unplayed",
        setScores: createEmptySetScores(matchFormat),
      });
      order += 1;
    }
  }

  return matches;
}

/**
 * Returns the operational match number for valid cards without changing the
 * generated order persisted on each LeagueMatch.
 */
export function getActiveMatchOrders(matches: readonly LeagueMatch[]): ReadonlyMap<string, number> {
  const orders = new Map<string, number>();
  let displayOrder = 1;

  for (const match of matches) {
    if (!match.isValid) continue;
    orders.set(match.id, displayOrder);
    displayOrder += 1;
  }

  return orders;
}

type MatchPairing = readonly [leftIndex: number, rightIndex: number];

function createMatchPairings(participantCount: number): MatchPairing[] {
  if (participantCount < 2) return [];

  // A five-participant group is the small complete graph for which this
  // explicit path avoids a repeated participant between every adjacent card.
  if (participantCount === 5) {
    return [[0, 1], [2, 3], [0, 4], [1, 2], [3, 4], [0, 2], [1, 3], [2, 4], [0, 3], [1, 4]];
  }

  const slotCount = participantCount % 2 === 0 ? participantCount : participantCount + 1;
  const fixedIndex = 0;
  let rotatingIndexes: Array<number | undefined> = Array.from(
    { length: slotCount - 1 },
    (_, index) => index + 1 < participantCount ? index + 1 : undefined,
  );
  const pairings: MatchPairing[] = [];

  // The circle method creates one round per rotation, with each participant
  // appearing at most once in a round. Flattening the rounds gives a stable
  // order with no adjacent repeat for groups of six or more.
  for (let round = 0; round < slotCount - 1; round += 1) {
    const positions: Array<number | undefined> = [fixedIndex, ...rotatingIndexes];
    for (let leftIndex = 0; leftIndex < slotCount / 2; leftIndex += 1) {
      const rightIndex = slotCount - 1 - leftIndex;
      const left = positions[leftIndex];
      const right = positions[rightIndex];
      if (left !== undefined && right !== undefined) {
        pairings.push([Math.min(left, right), Math.max(left, right)]);
      }
    }
    rotatingIndexes = [rotatingIndexes[rotatingIndexes.length - 1], ...rotatingIndexes.slice(0, -1)];
  }

  // Keep the first generated card stable as the first two名簿上の参加単位.
  const firstPairingIndex = pairings.findIndex(([left, right]) => left === 0 && right === 1);
  return firstPairingIndex <= 0
    ? pairings
    : [...pairings.slice(firstPairingIndex), ...pairings.slice(0, firstPairingIndex)];
}

export function countValidMatchesByParticipant(
  matches: readonly LeagueMatch[],
  participantIds: readonly string[],
): Map<string, number> {
  const counts = new Map(participantIds.map((participantId) => [participantId, 0]));

  for (const match of matches) {
    if (!match.isValid) {
      continue;
    }
    counts.set(match.participantAId, (counts.get(match.participantAId) ?? 0) + 1);
    counts.set(match.participantBId, (counts.get(match.participantBId) ?? 0) + 1);
  }

  return counts;
}

export function validateLeague(league: League, requireCompleteRanks = false): LeagueValidationResult {
  const errors: LeagueValidationIssue[] = [];
  const warnings: LeagueValidationIssue[] = [];
  const enteredParticipants = league.participants.filter((participant) => !isLeagueParticipantEmpty(participant));
  const selected = enteredParticipants.filter((participant) => participant.selectionStatus === "selected");

  if (!Number.isInteger(league.capacity) || league.capacity < 1) {
    errors.push({ code: "LEAGUE_CAPACITY_INVALID", message: "定員は1以上の整数で指定してください。", field: "capacity" });
  }
  if (selected.length > league.capacity) {
    errors.push({ code: "LEAGUE_CAPACITY_EXCEEDED", message: "選出者数が定員を超えています." });
  }

  if (enteredParticipants.length === 0) {
    errors.push({ code: "PARTICIPANT_REQUIRED", message: "参加者を1件以上入力してください。" });
  }

  for (const [label, value] of [
    ["勝ち", league.scoringPolicy.winPoints],
    ["引き分け", league.scoringPolicy.drawPoints],
    ["負け", league.scoringPolicy.lossPoints],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      errors.push({ code: "SCORING_INVALID", message: `${label}の勝点は0〜100の整数で指定してください。` });
    }
  }

  for (const participant of enteredParticipants) {
    if (!participant.displayName.trim()) {
      errors.push({ code: "PARTICIPANT_NAME_REQUIRED", message: "参加者名を入力してください。", participantId: participant.id });
    }
    const memberNames = participant.memberNames.filter((name) => name.trim());
    if (participant.participantType === "doubles" && memberNames.length !== 2) {
      errors.push({ code: "DOUBLES_MEMBER_COUNT", message: "ダブルスはメンバー2名を入力してください。", participantId: participant.id });
    }
    if (participant.participantType === "team" && memberNames.length < 1) {
      errors.push({ code: "TEAM_MEMBER_COUNT", message: "チームはメンバーを1名以上入力してください。", participantId: participant.id });
    }
  }

  if (selected.length > 0 && league.groups.length > 0) {
    const grouped = new Set(league.groups.flatMap((group) => group.participantIds));
    for (const participant of selected) {
      if (!grouped.has(participant.id)) {
        errors.push({ code: "PARTICIPANT_GROUP_REQUIRED", message: "選出者をすべてグループへ割り当ててください。", participantId: participant.id });
      }
    }
  }

  if (requireCompleteRanks) {
    errors.push(...validateManualRanks(league).errors);
  }

  if (enteredParticipants.some((participant) => participant.displayName.trim() && duplicateNameCount(enteredParticipants, participant.displayName) > 1)) {
    warnings.push({ code: "DUPLICATE_PARTICIPANT_NAME", message: "参加者名が重複しています。IDで区別して管理します。" });
  }

  return { errors, warnings };
}

export function calculateStandings(
  groups: readonly LeagueGroup[],
  matches: readonly LeagueMatch[],
  scoringPolicy: LeagueScoringPolicy,
  previousStandings: readonly LeagueStanding[] = [],
): LeagueStanding[] {
  const previousByParticipantId = new Map(previousStandings.map((standing) => [standing.participantId, standing]));
  const standings = groups.flatMap((group) => group.participantIds.map((participantId) => {
    const previous = previousByParticipantId.get(participantId);
    return {
      groupId: group.id,
      participantId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      manualRank: previous?.manualRank,
      rankStatus: previous?.manualRank === undefined ? "unconfirmed" : "confirmed",
    } satisfies LeagueStanding;
  }));
  const byParticipantId = new Map(standings.map((standing) => [standing.participantId, standing]));

  for (const match of matches) {
    if (!match.isValid || match.result === "unplayed") {
      continue;
    }
    const left = byParticipantId.get(match.participantAId);
    const right = byParticipantId.get(match.participantBId);
    if (!left || !right) {
      continue;
    }
    left.played += 1;
    right.played += 1;
    applyResult(left, right, match.result, scoringPolicy);
  }

  const automaticRanks = calculateAutomaticRanks(groups, standings, matches);
  return standings.map((standing) => ({
    ...standing,
    rank: automaticRanks.get(standing.participantId),
  }));
}

type RankingScoreStats = {
  completedMatches: number;
  setWins: number;
  setLosses: number;
  gameWins: number;
  gameLosses: number;
  complete: boolean;
};

type CompleteLeagueSetScore = {
  participantA: number;
  participantB: number;
};

/**
 * 勝点、直接対決、セット率、ゲーム率、グループ内の参加者順で、
 * グループごとの自動順位を計算する。順位は同順位を作らず、1位からの連番とする。
 */
export function calculateAutomaticRanks(
  groups: readonly LeagueGroup[],
  standings: readonly LeagueStanding[],
  matches: readonly LeagueMatch[],
): Map<string, number> {
  const standingByParticipantId = new Map(standings.map((standing) => [standing.participantId, standing]));
  const automaticRanks = new Map<string, number>();

  for (const group of groups) {
    const groupStandings = group.participantIds
      .map((participantId) => standingByParticipantId.get(participantId))
      .filter((standing): standing is LeagueStanding => standing?.groupId === group.id);

    const pointsBuckets = partitionByNumber(
      groupStandings.map((standing) => standing.participantId),
      (participantId) => standingByParticipantId.get(participantId)?.points ?? 0,
    );
    const orderedParticipantIds = pointsBuckets.flatMap((bucket) => (
      bucket.length === 1 ? bucket : rankTiedParticipants(bucket, matches)
    ));
    orderedParticipantIds.forEach((participantId, index) => automaticRanks.set(participantId, index + 1));
  }

  return automaticRanks;
}

function rankTiedParticipants(
  participantIds: readonly string[],
  matches: readonly LeagueMatch[],
): string[] {
  if (participantIds.length < 2) return [...participantIds];

  const directWins = calculateHeadToHeadWins(participantIds, matches);
  const directBuckets = partitionByNumber(participantIds, (participantId) => directWins.get(participantId) ?? 0);
  if (directBuckets.length > 1) {
    return directBuckets.flatMap((bucket) => rankByScoreCriteria(bucket, matches));
  }

  return rankByScoreCriteria(participantIds, matches);
}

function rankByScoreCriteria(
  participantIds: readonly string[],
  matches: readonly LeagueMatch[],
): string[] {
  if (participantIds.length < 2) return [...participantIds];

  const scoreStats = calculateRankingScoreStats(participantIds, matches);
  const setRateBuckets = partitionByRatio(
    participantIds,
    scoreStats,
    (stats) => stats.setWins,
    (stats) => stats.setWins + stats.setLosses,
  );
  if (setRateBuckets) {
    return setRateBuckets.flatMap((bucket) => rankByGameRateOrGroupOrder(bucket, scoreStats));
  }

  return rankByGameRateOrGroupOrder(participantIds, scoreStats);
}

function rankByGameRateOrGroupOrder(
  participantIds: readonly string[],
  scoreStats: ReadonlyMap<string, RankingScoreStats>,
): string[] {
  if (participantIds.length < 2) return [...participantIds];

  const gameRateBuckets = partitionByRatio(
    participantIds,
    scoreStats,
    (stats) => stats.gameWins,
    (stats) => stats.gameWins + stats.gameLosses,
  );
  return gameRateBuckets?.flat() ?? [...participantIds];
}

function calculateHeadToHeadWins(
  participantIds: readonly string[],
  matches: readonly LeagueMatch[],
): Map<string, number> {
  const participantSet = new Set(participantIds);
  const wins = new Map(participantIds.map((participantId) => [participantId, 0]));

  for (const match of matches) {
    if (!match.isValid || match.result === "unplayed") continue;
    if (!participantSet.has(match.participantAId) || !participantSet.has(match.participantBId)) continue;
    if (match.result === "participantAWin") {
      wins.set(match.participantAId, (wins.get(match.participantAId) ?? 0) + 1);
    } else if (match.result === "participantBWin") {
      wins.set(match.participantBId, (wins.get(match.participantBId) ?? 0) + 1);
    }
  }

  return wins;
}

function calculateRankingScoreStats(
  participantIds: readonly string[],
  matches: readonly LeagueMatch[],
): Map<string, RankingScoreStats> {
  const stats = new Map(participantIds.map((participantId) => [participantId, {
    completedMatches: 0,
    setWins: 0,
    setLosses: 0,
    gameWins: 0,
    gameLosses: 0,
    complete: true,
  }]));

  for (const match of matches) {
    if (!match.isValid || match.result === "unplayed") continue;
    const left = stats.get(match.participantAId);
    const right = stats.get(match.participantBId);
    if (!left && !right) continue;

    if (left) left.completedMatches += 1;
    if (right) right.completedMatches += 1;
    // WO is a completed result, but its stored game values are record-only
    // and must not affect set/game-rate tie breakers.
    if (match.isWalkover) continue;
    const setScores = getRankableSetScores(match);
    if (!setScores) {
      if (left) left.complete = false;
      if (right) right.complete = false;
      continue;
    }

    for (const score of setScores) {
      if (left) {
        left.gameWins += score.participantA;
        left.gameLosses += score.participantB;
        if (score.participantA > score.participantB) {
          left.setWins += 1;
        } else if (score.participantB > score.participantA) {
          left.setLosses += 1;
        }
      }
      if (right) {
        right.gameWins += score.participantB;
        right.gameLosses += score.participantA;
        if (score.participantB > score.participantA) {
          right.setWins += 1;
        } else if (score.participantA > score.participantB) {
          right.setLosses += 1;
        }
      }
    }
  }

  return stats;
}

function getRankableSetScores(match: LeagueMatch): readonly CompleteLeagueSetScore[] | undefined {
  const setScores = match.setScores;
  if (!setScores || setScores.length === 0) return undefined;

  const setsToWin = Math.floor(setScores.length / 2) + 1;
  let participantAWins = 0;
  let participantBWins = 0;
  let winnerDetermined = false;
  const completedScores: CompleteLeagueSetScore[] = [];

  for (const score of setScores) {
    if (!isCompleteScore(score)) {
      if (winnerDetermined) break;
      return undefined;
    }
    if (winnerDetermined) continue;

    completedScores.push(score);
    if (score.participantA > score.participantB) participantAWins += 1;
    if (score.participantB > score.participantA) participantBWins += 1;
    winnerDetermined = participantAWins >= setsToWin || participantBWins >= setsToWin;
  }

  if (match.result === "participantAWin") {
    return participantAWins >= setsToWin && participantBWins < setsToWin ? completedScores : undefined;
  }
  if (match.result === "participantBWin") {
    return participantBWins >= setsToWin && participantAWins < setsToWin ? completedScores : undefined;
  }
  if (match.result === "draw" && completedScores.length === setScores.length && !winnerDetermined) {
    return completedScores;
  }
  return undefined;
}

function isCompleteScore(score: LeagueSetScore): score is CompleteLeagueSetScore {
  if (score.participantA === null || score.participantB === null) return false;
  return Number.isInteger(score.participantA)
    && score.participantA >= 0
    && Number.isInteger(score.participantB)
    && score.participantB >= 0;
}

function partitionByNumber(
  participantIds: readonly string[],
  getValue: (participantId: string) => number,
): string[][] {
  const buckets = new Map<number, string[]>();
  for (const participantId of participantIds) {
    const value = getValue(participantId);
    const bucket = buckets.get(value) ?? [];
    bucket.push(participantId);
    buckets.set(value, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, bucket]) => bucket);
}

function partitionByRatio(
  participantIds: readonly string[],
  scoreStats: ReadonlyMap<string, RankingScoreStats>,
  getNumerator: (stats: RankingScoreStats) => number,
  getDenominator: (stats: RankingScoreStats) => number,
): string[][] | undefined {
  const firstStats = scoreStats.get(participantIds[0]!);
  if (!firstStats || !firstStats.complete || firstStats.completedMatches === 0) return undefined;
  const completedMatchCount = firstStats.completedMatches;

  for (const participantId of participantIds) {
    const stats = scoreStats.get(participantId);
    if (!stats || !stats.complete || stats.completedMatches !== completedMatchCount || getDenominator(stats) === 0) {
      return undefined;
    }
  }

  const order = new Map(participantIds.map((participantId, index) => [participantId, index]));
  const sorted = [...participantIds].sort((leftId, rightId) => {
    const left = scoreStats.get(leftId)!;
    const right = scoreStats.get(rightId)!;
    const comparison = getNumerator(right) * getDenominator(left)
      - getNumerator(left) * getDenominator(right);
    return comparison || order.get(leftId)! - order.get(rightId)!;
  });
  const buckets: string[][] = [];
  for (const participantId of sorted) {
    const previous = buckets.at(-1)?.[0];
    if (previous === undefined) {
      buckets.push([participantId]);
      continue;
    }
    const currentStats = scoreStats.get(participantId)!;
    const previousStats = scoreStats.get(previous)!;
    const comparison = getNumerator(currentStats) * getDenominator(previousStats)
      - getNumerator(previousStats) * getDenominator(currentStats);
    if (comparison === 0) {
      buckets.at(-1)!.push(participantId);
    } else {
      buckets.push([participantId]);
    }
  }
  return buckets;
}

export function getEffectiveLeagueRank(
  standing: LeagueStanding,
  automaticRanks: ReadonlyMap<string, number>,
): number | undefined {
  return standing.manualRank ?? automaticRanks.get(standing.participantId) ?? standing.rank;
}

export function validateManualRanks(league: League): LeagueValidationResult {
  const errors: LeagueValidationIssue[] = [];
  const automaticRanks = calculateAutomaticRanks(league.groups, league.standings, league.matches);

  for (const group of league.groups) {
    const groupStandings = league.standings.filter((standing) => standing.groupId === group.id);
    for (const standing of groupStandings) {
      const rank = standing.manualRank;
      if (rank !== undefined && (!Number.isInteger(rank) || rank < 1 || rank > group.participantIds.length)) {
        errors.push({ code: "MANUAL_RANK_INVALID", message: `グループ${group.name}の訂正順位は1〜${group.participantIds.length}の整数で指定してください。`, participantId: standing.participantId, groupId: group.id });
      }
    }

    const effectiveRanks = group.participantIds
      .map((participantId) => {
        const standing = groupStandings.find((item) => item.participantId === participantId);
        return standing ? getEffectiveLeagueRank(standing, automaticRanks) : undefined;
      })
      .filter((rank): rank is number => rank !== undefined);
    if (effectiveRanks.length !== group.participantIds.length || new Set(effectiveRanks).size !== effectiveRanks.length) {
      errors.push({ code: "MANUAL_RANK_CONFLICT", message: `グループ${group.name}の訂正後順位が重複または不足しています。`, groupId: group.id });
    }
  }
  return { errors, warnings: [] };
}

export function hasLeagueResults(league: League): boolean {
  return league.matches.some((match) => match.result !== "unplayed");
}

export function hasDuplicateParticipantName(participants: readonly LeagueParticipant[], displayName: string): boolean {
  return duplicateNameCount(participants, displayName) > 1;
}

function duplicateNameCount(participants: readonly LeagueParticipant[], displayName: string): number {
  const normalized = displayName.trim();
  return participants.filter((participant) => participant.displayName.trim() === normalized).length;
}

function applyResult(
  left: LeagueStanding,
  right: LeagueStanding,
  result: LeagueMatchResult,
  scoringPolicy: LeagueScoringPolicy,
): void {
  if (result === "participantAWin") {
    left.wins += 1;
    right.losses += 1;
    left.points += scoringPolicy.winPoints;
    right.points += scoringPolicy.lossPoints;
    return;
  }
  if (result === "participantBWin") {
    left.losses += 1;
    right.wins += 1;
    left.points += scoringPolicy.lossPoints;
    right.points += scoringPolicy.winPoints;
    return;
  }
  left.draws += 1;
  right.draws += 1;
  left.points += scoringPolicy.drawPoints;
  right.points += scoringPolicy.drawPoints;
}
