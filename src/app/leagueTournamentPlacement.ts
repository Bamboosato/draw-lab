import type { Entrant, Tournament, ValidationIssue, ValidationResult } from "../domain/types";
import type {
  RankRange,
  TournamentIntegrationParticipant,
  TournamentIntegrationRecord,
  TournamentPlacementContext,
} from "../domain/leagueTournamentTypes";
import { getIntegrationRankUpperBound } from "./leagueTournamentAdapter";
import { getValidEntrants, isEntrantEmptyForMatchType, validateTournament } from "../domain/validation";

export type LeagueTournamentScope = {
  tournament: Tournament;
  eligibleEntrants: Entrant[];
  placementContext: TournamentPlacementContext;
  issues: ValidationResult;
};

export function isValidRankRange(range: RankRange, upperBound?: number): boolean {
  return Number.isInteger(range.min)
    && Number.isInteger(range.max)
    && range.min >= 1
    && range.max >= range.min
    && (upperBound === undefined || (Number.isInteger(upperBound) && upperBound >= 1 && range.max <= upperBound));
}

export function getRankOptions(upperBound?: number, minimum = 1): number[] {
  const validUpperBound = typeof upperBound === "number" && Number.isInteger(upperBound) && upperBound >= 1
    ? upperBound
    : undefined;
  if (validUpperBound === undefined || !Number.isInteger(minimum) || minimum < 1 || minimum > validUpperBound) {
    return [];
  }
  return Array.from({ length: validUpperBound - minimum + 1 }, (_, index) => minimum + index);
}

export function normalizeRankRange(range: RankRange, upperBound?: number): RankRange {
  const min = Number.isInteger(range.min) && range.min >= 1 ? range.min : 1;
  const max = Number.isInteger(range.max) && range.max >= 1 ? range.max : min;
  const validUpperBound = typeof upperBound === "number" && Number.isInteger(upperBound) && upperBound >= 1
    ? upperBound
    : undefined;
  if (validUpperBound === undefined) {
    return { min, max: Math.max(min, max) };
  }
  const normalizedMin = Math.min(min, validUpperBound);
  return {
    min: normalizedMin,
    max: Math.min(Math.max(max, normalizedMin), validUpperBound),
  };
}

export function getRankRangeValidationMessage(range: RankRange, upperBound?: number): string {
  if (!Number.isInteger(range.min) || range.min < 1) {
    return "開始順位は1位以上で指定してください";
  }
  if (!Number.isInteger(range.max) || range.max < 1) {
    return "終了順位は1位以上で指定してください";
  }
  if (range.max < range.min) {
    return `終了順位は開始順位（${range.min}位）以上で指定してください`;
  }
  return upperBound === undefined
    ? "順位区分を正しい範囲で指定してください"
    : `終了順位をグループ内の人数（${upperBound}位）以下で指定してください`;
}

export function getLeagueTournamentScope(
  tournament: Tournament,
  integration: TournamentIntegrationRecord,
): LeagueTournamentScope {
  const integrationParticipants = new Map(
    integration.participants.map((participant) => [participant.tournamentEntrantId, participant]),
  );
  const eligibleEntrants = getValidEntrants(tournament.entrants, tournament.matchType);
  const rankRange = integration.rankRange;
  const rankUpperBound = getIntegrationRankUpperBound(integration);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isValidRankRange(rankRange, rankUpperBound)) {
    errors.push({
      code: "LEAGUE_RANK_RANGE_INVALID",
      message: getRankRangeValidationMessage(rankRange, rankUpperBound),
      field: "rankRange",
    });
  }

  const missingRankEntrants: Entrant[] = [];
  const rankedEntrants = eligibleEntrants.filter((entrant) => {
    const placement = integrationParticipants.get(entrant.id);
    if (placement?.rank === undefined) {
      missingRankEntrants.push(entrant);
      return false;
    }
    return placement.rank >= rankRange.min && placement.rank <= rankRange.max;
  });

  if (missingRankEntrants.length > 0) {
    warnings.push({
      code: "LEAGUE_RANK_MISSING",
      message: `${missingRankEntrants.length}名の順位が未入力のため、現在の区分ではドロー対象外です`,
      field: "rank",
    });
  }

  if (isValidRankRange(rankRange) && rankedEntrants.length < 2) {
    errors.push({
      code: "LEAGUE_RANKED_ENTRANTS_TOO_FEW",
      message: "指定した順位区分に該当する参加者を2名以上用意してください",
      field: "rankRange",
    });
  }

  const scopedTournament: Tournament = {
    ...tournament,
    entrants: rankedEntrants,
  };
  const baseValidation = validateTournament(scopedTournament);
  const issues: ValidationResult = {
    errors: [...errors, ...baseValidation.errors],
    warnings: [...warnings, ...baseValidation.warnings],
  };
  const groupKeys = new Set(
    rankedEntrants
      .map((entrant) => {
        const participant = integrationParticipants.get(entrant.id);
        return participant?.groupKey ?? participant?.sourceGroupId;
      })
      .filter((value): value is string => Boolean(value)),
  );

  return {
    tournament: scopedTournament,
    eligibleEntrants: rankedEntrants,
    placementContext: {
      rankRange,
      participants: integrationParticipants,
    groupCount: integration.sourceGroupCount ?? groupKeys.size,
    },
    issues,
  };
}

export function getTournamentGenerationEntrants(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): Entrant[] {
  if (!integration) {
    return getValidEntrants(tournament.entrants, tournament.matchType);
  }
  return getLeagueTournamentScope(tournament, integration).eligibleEntrants;
}

export function validateLeagueTournament(
  tournament: Tournament,
  integration: TournamentIntegrationRecord,
): ValidationResult {
  return getLeagueTournamentScope(tournament, integration).issues;
}

export function createPlacementContext(
  integration: TournamentIntegrationRecord,
): TournamentPlacementContext {
  const participants = new Map<string, TournamentIntegrationParticipant>(
    integration.participants.map((participant) => [participant.tournamentEntrantId, participant]),
  );
  const groupKeys = new Set(
    integration.participants
      .map((participant) => participant.groupKey ?? participant.sourceGroupId)
      .filter((value): value is string => Boolean(value)),
  );
  return { rankRange: integration.rankRange, participants, groupCount: integration.sourceGroupCount ?? groupKeys.size };
}

export function updateIntegrationGroup(
  integration: TournamentIntegrationRecord,
  entrantId: string,
  group: { key?: string; label?: string },
): TournamentIntegrationRecord {
  return {
    ...integration,
    participants: integration.participants.map((participant) =>
      participant.tournamentEntrantId === entrantId
        ? { ...participant, groupKey: group.key, groupLabel: group.label }
        : participant),
    updatedAt: new Date().toISOString(),
  };
}

export function isEligibleRosterEntrant(entrant: Entrant, tournament: Tournament): boolean {
  return !isEntrantEmptyForMatchType(entrant, tournament.matchType);
}
