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
