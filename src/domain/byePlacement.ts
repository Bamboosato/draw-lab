import {
  findSlotByPosition,
  getHalfIndex,
  getOpponentPosition,
  getQuarterIndex,
  isSlotAvailable,
} from "./bracketStructure";
import { pickWithRandom } from "./random";
import { getSeedPositionLookup } from "./seedPlacement";
import type { DrawSize, DrawSlot, PlaceByesParams } from "./types";

export function calculateByeCount(drawSize: DrawSize, entrantCount: number): number {
  return Math.max(0, drawSize - entrantCount);
}

export function placeByes(params: PlaceByesParams): DrawSlot[] {
  const nextSlots = params.slots.map((slot) => ({ ...slot }));
  let remaining = Math.max(0, params.byeCount);

  if (remaining === 0) {
    return nextSlots;
  }

  const seedPositionLookup = params.seedPositionLookup ?? getSeedPositionLookup(params.drawSize, params.options, params.random);

  for (let index = 0; index < params.byeCount; index += 1) {
    if (remaining === 0) {
      break;
    }

    const byeSeedNo = params.drawSize - index;
    const slot = findSlotByPosition(nextSlots, seedPositionLookup[byeSeedNo]);

    if (isSlotAvailable(slot)) {
      slot.isBye = true;
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    const candidates = getByeCandidates(nextSlots);
    const fallbackCandidates = nextSlots.filter(isSlotAvailable);
    const selectable = candidates.length > 0 ? candidates : fallbackCandidates;

    if (selectable.length === 0) {
      break;
    }

    const minScore = Math.min(...selectable.map((slot) => scoreByeCandidate(slot.position, nextSlots, params.drawSize)));
    const bestCandidates = selectable.filter(
      (slot) => scoreByeCandidate(slot.position, nextSlots, params.drawSize) === minScore,
    );
    const selected = pickWithRandom(bestCandidates, params.random);
    selected.isBye = true;
    remaining -= 1;
  }

  return nextSlots;
}

function getByeCandidates(slots: readonly DrawSlot[]): DrawSlot[] {
  return slots.filter((slot) => {
    if (!isSlotAvailable(slot)) {
      return false;
    }

    const opponent = findSlotByPosition(slots, getOpponentPosition(slot.position));
    return !opponent?.isBye;
  });
}

function scoreByeCandidate(position: number, slots: readonly DrawSlot[], drawSize: DrawSize): number {
  const half = getHalfIndex(position, drawSize);
  const quarter = getQuarterIndex(position, drawSize);
  const halfByeCount = slots.filter((slot) => slot.isBye && getHalfIndex(slot.position, drawSize) === half).length;
  const quarterByeCount = slots.filter((slot) => slot.isBye && getQuarterIndex(slot.position, drawSize) === quarter).length;

  return quarterByeCount * 100 + halfByeCount * 10;
}
