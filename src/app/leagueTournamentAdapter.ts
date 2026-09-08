import type { CompetitionBasicInfo, CommonParticipantUnit } from "../domain/competitionTypes";
import { VALID_DRAW_SIZES, type DrawSize, type Entrant, type MatchType, type Tournament } from "../domain/types";
import type { League, LeagueGroup, LeagueParticipant, LeagueStanding } from "../domain/leagueTypes";
import type {
  LeagueParticipantPlacement,
  LeagueToTournamentSetup,
  RankRange,
  TournamentIntegrationParticipant,
  TournamentIntegrationRecord,
} from "../domain/leagueTournamentTypes";
import { calculateAutomaticRanks, calculateStandings, getEffectiveLeagueRank } from "../domain/leagueLogic";
import { createEmptyEntrant, createId, ensureEntrantRows } from "./tournamentModel";

export function formatLeagueTournamentTitle(leagueTitle: string, rankRange: RankRange): string {
  const normalized = normalizeRankRange(rankRange);
  return `${leagueTitle.trim() || "無題のリーグ"}（${normalized.min}-${normalized.max}位）`;
}

export function calculateLeagueDrawSize(groupCount: number | undefined, rankRange: RankRange): number | undefined {
  if (groupCount === undefined || !Number.isInteger(groupCount) || groupCount < 0 || !Number.isInteger(rankRange.min) || !Number.isInteger(rankRange.max) || rankRange.min < 1 || rankRange.max < rankRange.min) {
    return undefined;
  }
  return groupCount * (rankRange.max - rankRange.min + 1);
}

export function getLeagueRankUpperBound(league: League): number | undefined {
  if (league.groups.length === 0) {
    return undefined;
  }

  return Math.min(...league.groups.map((group) => group.participantIds.length));
}

export function getIntegrationRankUpperBound(integration: TournamentIntegrationRecord): number | undefined {
  if (integration.sourceGroupSizes && integration.sourceGroupSizes.length > 0) {
    return Math.min(...integration.sourceGroupSizes);
  }

  const participantCounts = new Map<string, number>();
  integration.participants.forEach((participant) => {
    const groupKey = participant.sourceGroupId ?? participant.groupKey;
    if (groupKey) {
      participantCounts.set(groupKey, (participantCounts.get(groupKey) ?? 0) + 1);
    }
  });

  return participantCounts.size > 0 ? Math.min(...participantCounts.values()) : undefined;
}

export function resolveLeagueDrawSize(groupCount: number | undefined, rankRange: RankRange): DrawSize | undefined {
  const value = calculateLeagueDrawSize(groupCount, rankRange);
  return value !== undefined && VALID_DRAW_SIZES.includes(value as DrawSize) ? value as DrawSize : undefined;
}

export type LeagueTournamentBuildResult = {
  tournament: Tournament;
  integration: TournamentIntegrationRecord;
};

export function canCreateTournamentFromLeague(league: League): boolean {
  return league.matchSelectionStatus === "confirmed";
}

export function getSelectedLeagueParticipants(league: League): LeagueParticipant[] {
  const selectedIds = new Set(league.selection.selectedParticipantIds);
  return league.participants.filter((participant) =>
    selectedIds.has(participant.id) && participant.selectionStatus === "selected");
}

export function createLeagueToTournament(
  tournament: Tournament,
  league: League,
  rankRange: RankRange,
  now = new Date().toISOString(),
): LeagueTournamentBuildResult {
  if (!canCreateTournamentFromLeague(league)) {
    throw new Error("対戦カードが確定しているリーグだけを引き継げます。");
  }
  const selectedParticipants = getSelectedLeagueParticipants(league);
  const groupByParticipantId = getGroupByParticipantId(league.groups);
  const calculatedStandings = calculateStandings(league.groups, league.matches, league.scoringPolicy, league.standings);
  const standingByParticipantId = getStandingByParticipantId(calculatedStandings);
  const automaticRanks = calculateAutomaticRanks(league.groups, calculatedStandings, league.matches);
  const matchType = toMatchType(league.participantType);
  const drawSize = resolveLeagueDrawSize(league.groups.length, rankRange) ?? tournament.drawSize;
  const entrants = selectedParticipants.map((participant, index) =>
    toEntrant(participant, matchType, index + 1));
  const placements = selectedParticipants.map((participant) =>
    toPlacement(participant, groupByParticipantId.get(participant.id), standingByParticipantId.get(participant.id), automaticRanks));
  const source = {
    leagueId: league.id,
    leagueUpdatedAt: league.updatedAt,
    matchSelectionStatus: league.matchSelectionStatus,
  } as const;
  const integration: TournamentIntegrationRecord = {
    tournamentId: tournament.id,
    kind: "league-to-tournament",
    schemaVersion: 1,
    source,
    sourceParticipantType: league.participantType,
    sourceGroupCount: league.groups.length,
    sourceGroupSizes: league.groups.map((group) => group.participantIds.length),
    rankRange: normalizeRankRange(rankRange),
    drawSizeMode: "auto",
    participants: entrants.map((entrant, index) => ({
      tournamentEntrantId: entrant.id,
      ...placements[index],
      groupKey: placements[index]?.sourceGroupId,
      groupLabel: placements[index]?.sourceGroupName,
    })),
    createdAt: now,
    updatedAt: now,
  };
  const basicInfo = toCompetitionBasicInfo(league);
  const nextTournament: Tournament = {
    ...tournament,
    ...basicInfoToTournamentPatch(basicInfo, rankRange),
    matchType,
    drawSize,
    entrants: ensureEntrantRows(entrants, drawSize, matchType),
    generatedDraw: undefined,
    options: { ...tournament.options, randomSeed: undefined },
    updatedAt: now,
  };

  return { tournament: nextTournament, integration };
}

export function createLeagueToTournamentSetup(
  league: League,
  matchType: MatchType = toMatchType(league.participantType),
  rankRange: RankRange = { min: 1, max: 2 },
): LeagueToTournamentSetup {
  if (!canCreateTournamentFromLeague(league)) {
    throw new Error("対戦カードが確定しているリーグだけを引き継げます。");
  }
  const groupByParticipantId = getGroupByParticipantId(league.groups);
  const calculatedStandings = calculateStandings(league.groups, league.matches, league.scoringPolicy, league.standings);
  const standingByParticipantId = getStandingByParticipantId(calculatedStandings);
  const automaticRanks = calculateAutomaticRanks(league.groups, calculatedStandings, league.matches);
  return {
    kind: "league-to-tournament",
    schemaVersion: 1,
    source: {
      leagueId: league.id,
      leagueUpdatedAt: league.updatedAt,
      matchSelectionStatus: league.matchSelectionStatus,
    },
    basicInfo: { ...toCompetitionBasicInfo(league), participantType: toCompetitionParticipantType(matchType) },
    rankRange: normalizeRankRange(rankRange),
    participants: getSelectedLeagueParticipants(league).map((participant) => ({
      ...toCommonParticipantUnit(participant),
      placement: toPlacement(
        participant,
        groupByParticipantId.get(participant.id),
        standingByParticipantId.get(participant.id),
        automaticRanks,
      ),
    })),
  };
}

export function syncTournamentIntegrationParticipants(
  integration: TournamentIntegrationRecord,
  entrants: readonly Entrant[],
  now = new Date().toISOString(),
): TournamentIntegrationRecord {
  const existing = new Map(integration.participants.map((participant) => [participant.tournamentEntrantId, participant]));
  return {
    ...integration,
    participants: entrants.map((entrant) => existing.get(entrant.id) ?? {
      tournamentEntrantId: entrant.id,
    }),
    updatedAt: now,
  };
}

export function updateTournamentIntegrationPlacement(
  integration: TournamentIntegrationRecord,
  entrantId: string,
  patch: Pick<TournamentIntegrationParticipant, "groupKey" | "groupLabel" | "rank" | "rankOrigin">,
  now = new Date().toISOString(),
): TournamentIntegrationRecord {
  return {
    ...integration,
    participants: integration.participants.map((participant) =>
      participant.tournamentEntrantId === entrantId
        ? { ...participant, ...patch, rankOrigin: patch.rank === undefined ? undefined : patch.rankOrigin ?? "tournament-manual" }
        : participant),
    updatedAt: now,
  };
}

export function cloneTournamentIntegration(
  integration: TournamentIntegrationRecord,
  tournamentId: string,
  entrantIdMap: ReadonlyMap<string, string>,
  now = new Date().toISOString(),
): TournamentIntegrationRecord {
  return {
    ...integration,
    tournamentId,
    participants: integration.participants.map((participant) => ({
      ...participant,
      tournamentEntrantId: entrantIdMap.get(participant.tournamentEntrantId) ?? createId("entrant"),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function toEntrant(participant: LeagueParticipant, matchType: MatchType, index: number): Entrant {
  const entrant = createEmptyEntrant(index, matchType);
  const members = participant.memberNames.filter(Boolean);
  entrant.player1Name = matchType === "team"
    ? ""
    : matchType === "doubles" ? members[0] ?? participant.displayName : participant.displayName;
  entrant.player2Name = matchType === "doubles" ? members[1] ?? "" : undefined;
  entrant.teamName = matchType === "team" ? participant.displayName : undefined;
  entrant.memberNames = matchType === "team" ? members : undefined;
  entrant.team1 = participant.team ?? "";
  entrant.team2 = matchType === "doubles" ? participant.team ?? "" : undefined;
  entrant.region = participant.region ?? "";
  return entrant;
}

function toCommonParticipantUnit(participant: LeagueParticipant): CommonParticipantUnit {
  return {
    id: participant.id,
    participantType: participant.participantType,
    displayName: participant.displayName,
    members: participant.memberNames.map((name) => ({ name, affiliation: participant.team })),
    affiliation: participant.team,
    region: participant.region,
    note: participant.note,
  };
}

function toCompetitionBasicInfo(league: League): CompetitionBasicInfo {
  return {
    title: league.title,
    date: league.date ?? "",
    venue: league.venue ?? "",
    eventName: league.eventName ?? "",
    participantType: toCompetitionParticipantType(toMatchType(league.participantType)),
  };
}

function toMatchType(participantType: League["participantType"]): MatchType {
  return participantType === "individual" ? "singles" : participantType;
}

function toCompetitionParticipantType(matchType: MatchType): CompetitionBasicInfo["participantType"] {
  return matchType === "singles" ? "individual" : matchType;
}

function basicInfoToTournamentPatch(basicInfo: CompetitionBasicInfo, rankRange?: RankRange): Pick<Tournament, "title" | "date" | "venue" | "eventName"> {
  return {
    title: rankRange ? formatLeagueTournamentTitle(basicInfo.title ?? "", rankRange) : basicInfo.title,
    date: basicInfo.date,
    venue: basicInfo.venue,
    eventName: basicInfo.eventName,
  };
}

function toPlacement(
  participant: LeagueParticipant,
  group: LeagueGroup | undefined,
  standing: LeagueStanding | undefined,
  automaticRanks: ReadonlyMap<string, number>,
): LeagueParticipantPlacement {
  const rank = standing ? getEffectiveLeagueRank(standing, automaticRanks) : undefined;
  return {
    sourceParticipantId: participant.id,
    sourceGroupId: group?.id,
    sourceGroupName: group?.name,
    sourceGroupOrder: group ? group.participantIds.indexOf(participant.id) + 1 : undefined,
    rank: rank === undefined ? undefined : rank,
    rankOrigin: rank === undefined ? undefined : "league",
  };
}

function getGroupByParticipantId(groups: readonly LeagueGroup[]): Map<string, LeagueGroup> {
  const result = new Map<string, LeagueGroup>();
  for (const group of groups) {
    for (const participantId of group.participantIds) {
      result.set(participantId, group);
    }
  }
  return result;
}

function getStandingByParticipantId(standings: readonly LeagueStanding[]): Map<string, LeagueStanding> {
  const result = new Map<string, LeagueStanding>();
  for (const standing of standings) {
    result.set(standing.participantId, standing);
  }
  return result;
}

function normalizeRankRange(value: RankRange): RankRange {
  return { min: Math.max(1, Math.trunc(value.min)), max: Math.max(1, Math.trunc(value.max)) };
}
