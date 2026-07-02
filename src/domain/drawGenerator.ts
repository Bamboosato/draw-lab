import { createEmptySlots, isSlotAvailable } from "./bracketStructure";
import { calculateByeCount, placeByes } from "./byePlacement";
import { createSeededRandom, pickWithRandom } from "./random";
import { calculatePlacementPenalty } from "./scoring";
import { placeSeededEntrants } from "./seedPlacement";
import type {
  CreateGeneratedDrawParams,
  DrawSlot,
  Entrant,
  GeneratedDraw,
  GenerateDrawInput,
  GenerateDrawResult,
  PlaceUnseededEntrantsParams,
} from "./types";
import { getValidEntrants, normalizeTournament, validateTournament } from "./validation";

export function generateDraw(input: GenerateDrawInput): GenerateDrawResult {
  const normalizedTournament = normalizeTournament(input.tournament);
  const validation = validateTournament(normalizedTournament);

  if (validation.errors.length > 0) {
    return { validation };
  }

  const now = input.now;
  const randomSeed = input.randomSeed ?? normalizedTournament.options.randomSeed ?? createDeterministicFallbackSeed(normalizedTournament.id);
  const random = createSeededRandom(randomSeed);
  const validEntrants = getValidEntrants(normalizedTournament.entrants, normalizedTournament.matchType);
  let slots = createEmptySlots(normalizedTournament.drawSize);

  slots = placeSeededEntrants({
    slots,
    entrants: validEntrants,
    drawSize: normalizedTournament.drawSize,
    seedCount: normalizedTournament.seedCount,
    random,
  });

  slots = placeByes({
    slots,
    byeCount: calculateByeCount(normalizedTournament.drawSize, validEntrants.length),
    drawSize: normalizedTournament.drawSize,
    prioritizeSeedBye: normalizedTournament.options.prioritizeSeedBye,
    random,
  });

  const placedEntrantIds = new Set(slots.map((slot) => slot.entrantId).filter((id): id is string => Boolean(id)));
  const unseededEntrants = validEntrants.filter((entrant) => !placedEntrantIds.has(entrant.id));

  slots = placeUnseededEntrants({
    slots,
    entrants: unseededEntrants,
    entrantsById: new Map(validEntrants.map((entrant) => [entrant.id, entrant])),
    drawSize: normalizedTournament.drawSize,
    options: normalizedTournament.options,
    random,
  });

  const draw = createGeneratedDraw({
    tournamentId: normalizedTournament.id,
    randomSeed,
    slots,
    now,
  });

  return { draw, validation };
}

export function placeUnseededEntrants(params: PlaceUnseededEntrantsParams): DrawSlot[] {
  const nextSlots = params.slots.map((slot) => ({ ...slot }));
  const entrantsById = params.entrantsById ?? new Map(params.entrants.map((entrant) => [entrant.id, entrant]));
  const placementOrder = sortUnseededEntrants(params.entrants);

  for (const entrant of placementOrder) {
    const candidates = nextSlots.filter(isSlotAvailable);

    if (candidates.length === 0) {
      break;
    }

    const scoredCandidates = candidates.map((slot) => ({
      slot,
      score: calculatePlacementPenalty({
        entrant,
        candidatePosition: slot.position,
        slots: nextSlots,
        entrantsById,
        drawSize: params.drawSize,
        options: params.options,
      }),
    }));
    const minScore = Math.min(...scoredCandidates.map((candidate) => candidate.score));
    const bestCandidates = scoredCandidates.filter((candidate) => candidate.score === minScore);
    const selected = pickWithRandom(bestCandidates, params.random).slot;
    selected.entrantId = entrant.id;
  }

  return nextSlots;
}

export function createGeneratedDraw(params: CreateGeneratedDrawParams): GeneratedDraw {
  const sortedSlots = [...params.slots].sort((a, b) => a.position - b.position).map((slot) => ({ ...slot }));

  return {
    id: `draw-${stableHash(`${params.tournamentId}:${params.randomSeed}:${params.now}`)}`,
    tournamentId: params.tournamentId,
    randomSeed: params.randomSeed,
    slots: sortedSlots,
    generatedAt: params.now,
  };
}

function sortUnseededEntrants(entrants: readonly Entrant[]): Entrant[] {
  const teamCounts = countBy(entrants, getEntrantTeamKey);
  const regionCounts = countBy(entrants, (entrant) => entrant.region);

  return entrants
    .map((entrant, index) => ({ entrant, index }))
    .sort((a, b) => {
      const aGroupSize = Math.max(teamCounts.get(getEntrantTeamKey(a.entrant) ?? "") ?? 0, regionCounts.get(a.entrant.region ?? "") ?? 0);
      const bGroupSize = Math.max(teamCounts.get(getEntrantTeamKey(b.entrant) ?? "") ?? 0, regionCounts.get(b.entrant.region ?? "") ?? 0);

      return bGroupSize - aGroupSize || a.index - b.index;
    })
    .map(({ entrant }) => entrant);
}

function countBy(
  entrants: readonly Entrant[],
  keySelector: (entrant: Entrant) => string | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entrant of entrants) {
    const key = keySelector(entrant);

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function getEntrantTeamKey(entrant: Entrant): string | undefined {
  if (entrant.sameTeam) {
    return entrant.team1 ?? entrant.team2;
  }

  return [entrant.team1, entrant.team2].filter(Boolean).join("|") || undefined;
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createDeterministicFallbackSeed(tournamentId: string): string {
  return `seed-${stableHash(tournamentId)}`;
}
