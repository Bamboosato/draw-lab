import type {
  League,
  LeagueGroup,
  LeagueMatch,
  LeagueMatchResult,
  LeagueParticipant,
  LeagueScoringPolicy,
  LeagueStanding,
  LeagueValidationIssue,
  LeagueValidationResult,
} from "./leagueTypes";

export const DEFAULT_LEAGUE_SCORING_POLICY: LeagueScoringPolicy = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
};

export function isLeagueParticipantEmpty(participant: LeagueParticipant): boolean {
  return [
    participant.displayName,
    ...participant.memberNames,
    participant.team,
    participant.region,
    participant.note,
  ].every((value) => !value?.trim());
}

export function createCandidateMatches(groups: readonly LeagueGroup[], createId: () => string): LeagueMatch[] {
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
      });
      order += 1;
    }
  }

  return matches;
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

  return standings;
}

export function validateManualRanks(league: League): LeagueValidationResult {
  const errors: LeagueValidationIssue[] = [];
  for (const group of league.groups) {
    const groupStandings = league.standings.filter((standing) => standing.groupId === group.id);
    const ranks = groupStandings.map((standing) => standing.manualRank);
    if (ranks.some((rank) => rank === undefined)) {
      errors.push({ code: "MANUAL_RANK_INCOMPLETE", message: `グループ${group.name}の順位をすべて入力してください。`, groupId: group.id });
      continue;
    }
    const numericRanks = ranks as number[];
    const expected = new Set(Array.from({ length: group.participantIds.length }, (_, index) => index + 1));
    const actual = new Set(numericRanks);
    if (numericRanks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > group.participantIds.length) || actual.size !== numericRanks.length || actual.size !== expected.size || [...expected].some((rank) => !actual.has(rank))) {
      errors.push({ code: "MANUAL_RANK_INVALID", message: `グループ${group.name}の順位は1〜${group.participantIds.length}を重複・欠番なく入力してください。`, groupId: group.id });
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
