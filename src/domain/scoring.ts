import {
  findSlotByPosition,
  getHalfIndex,
  getOpponentPosition,
  getQuarterIndex,
} from "./bracketStructure";
import { areRelatedTeams } from "./teamGrouping";
import type { DrawSlot, Entrant, PlacementPenaltyParams } from "./types";

export const PLACEMENT_PENALTY = {
  sameTeamFirstRound: 1000,
  sameRegionFirstRound: 500,
  sameLeagueGroupAndRankFirstRound: 1600,
  sameLeagueGroupFirstRound: 700,
  sameLeagueRankFirstRound: 600,
  closeLeagueRankFirstRound: 500,
  sameTeamQuarter: 120,
  sameRegionQuarter: 80,
  sameTeamHalf: 40,
  sameRegionHalf: 25,
} as const;

export function calculatePlacementPenalty(params: PlacementPenaltyParams): number {
  let penalty = 0;
  const opponent = getPlacedEntrantAtPosition(
    params.slots,
    getOpponentPosition(params.candidatePosition),
    params.entrantsById,
  );

  if (opponent) {
    if (params.options.avoidSameTeam && areRelatedTeams(params.entrant, opponent)) {
      penalty += PLACEMENT_PENALTY.sameTeamFirstRound;
    }

    if (params.options.avoidSameRegion && isSameRegion(params.entrant, opponent)) {
      penalty += PLACEMENT_PENALTY.sameRegionFirstRound;
    }

    penalty += getLeaguePlacementPenalty(params.entrant.id, opponent.id, params.placementContext);
  }

  const candidateQuarter = getQuarterIndex(params.candidatePosition, params.drawSize);
  const candidateHalf = getHalfIndex(params.candidatePosition, params.drawSize);

  for (const slot of params.slots) {
    if (!slot.entrantId) {
      continue;
    }

    const placedEntrant = params.entrantsById.get(slot.entrantId);

    if (!placedEntrant) {
      continue;
    }

    if (getQuarterIndex(slot.position, params.drawSize) === candidateQuarter) {
      if (params.options.avoidSameTeam && areRelatedTeams(params.entrant, placedEntrant)) {
        penalty += PLACEMENT_PENALTY.sameTeamQuarter;
      }

      if (params.options.avoidSameRegion && isSameRegion(params.entrant, placedEntrant)) {
        penalty += PLACEMENT_PENALTY.sameRegionQuarter;
      }
    }

    if (getHalfIndex(slot.position, params.drawSize) === candidateHalf) {
      if (params.options.avoidSameTeam && areRelatedTeams(params.entrant, placedEntrant)) {
        penalty += PLACEMENT_PENALTY.sameTeamHalf;
      }

      if (params.options.avoidSameRegion && isSameRegion(params.entrant, placedEntrant)) {
        penalty += PLACEMENT_PENALTY.sameRegionHalf;
      }
    }
  }

  return penalty;
}

function getLeaguePlacementPenalty(
  entrantId: string,
  opponentId: string,
  placementContext: PlacementPenaltyParams["placementContext"],
): number {
  if (!placementContext || placementContext.groupCount === 0) {
    return 0;
  }

  const entrant = placementContext.participants.get(entrantId);
  const opponent = placementContext.participants.get(opponentId);

  if (!entrant || !opponent) {
    return 0;
  }

  const entrantGroup = entrant.groupKey ?? entrant.sourceGroupId;
  const opponentGroup = opponent.groupKey ?? opponent.sourceGroupId;
  const sameGroup = Boolean(entrantGroup && entrantGroup === opponentGroup);
  const sameRank = entrant.rank !== undefined && entrant.rank === opponent.rank;

  if (placementContext.groupCount > 1) {
    return (sameGroup && sameRank ? PLACEMENT_PENALTY.sameLeagueGroupAndRankFirstRound : 0)
      + (sameGroup ? PLACEMENT_PENALTY.sameLeagueGroupFirstRound : 0)
      + (sameRank ? PLACEMENT_PENALTY.sameLeagueRankFirstRound : 0);
  }

  if (entrant.rank === undefined || opponent.rank === undefined) {
    return 0;
  }

  const distance = Math.abs(entrant.rank - opponent.rank);
  return distance <= 1 ? PLACEMENT_PENALTY.closeLeagueRankFirstRound : 0;
}

export function isSameRegion(a: Entrant, b: Entrant): boolean {
  return Boolean(a.region && b.region && a.region === b.region);
}

function getPlacedEntrantAtPosition(
  slots: readonly DrawSlot[],
  position: number,
  entrantsById: Map<string, Entrant>,
): Entrant | undefined {
  const slot = findSlotByPosition(slots, position);
  return slot?.entrantId ? entrantsById.get(slot.entrantId) : undefined;
}
