import { findSlotByPosition } from "./bracketStructure";
import { shuffleWithRandom } from "./random";
import type { DrawSize, DrawSlot, Entrant, PlaceSeededEntrantsParams } from "./types";
import { getNumericSeedNo } from "./validation";

export function getSeedPositions(drawSize: DrawSize, seedCount: number): number[] {
  const targetCount = Math.max(0, Math.min(drawSize, Math.floor(seedCount)));

  if (targetCount === 0) {
    return [];
  }

  const positions = [1];

  if (targetCount >= 2) {
    positions.push(drawSize);
  }

  for (let divisions = 2; positions.length < targetCount && divisions <= drawSize; divisions *= 2) {
    const segmentSize = drawSize / divisions;

    for (let segment = 1; segment < divisions && positions.length < targetCount; segment += 2) {
      const boundary = segment * segmentSize;
      addUniquePosition(positions, boundary, drawSize, targetCount);
      addUniquePosition(positions, boundary + 1, drawSize, targetCount);
    }
  }

  return positions.slice(0, targetCount);
}

export function placeSeededEntrants(params: PlaceSeededEntrantsParams): DrawSlot[] {
  const nextSlots = cloneSlots(params.slots);
  const seedPositions = getSeedPositions(params.drawSize, params.seedCount);
  const seededEntrants = params.entrants
    .filter((entrant) => {
      const seedNo = getNumericSeedNo(entrant);
      return seedNo !== undefined && seedNo <= params.seedCount;
    })
    .sort(compareSeededEntrants);

  for (const band of getSeedBands(params.seedCount)) {
    const bandPositions = seedPositions.slice(band.start - 1, band.end);
    const bandEntrants = seededEntrants.filter((entrant) => {
      const seedNo = getNumericSeedNo(entrant);
      return seedNo !== undefined && seedNo >= band.start && seedNo <= band.end;
    });

    const positions = band.start <= 2 ? bandPositions : shuffleWithRandom(bandPositions, params.random);
    const entrants = band.start <= 2 ? bandEntrants : shuffleWithRandom(bandEntrants, params.random);

    entrants.slice(0, positions.length).forEach((entrant, index) => {
      const slot = findSlotByPosition(nextSlots, positions[index]);
      const seedNo = getNumericSeedNo(entrant);

      if (slot && seedNo !== undefined && !slot.entrantId && !slot.isBye) {
        slot.entrantId = entrant.id;
        slot.seedNo = seedNo;
      }
    });
  }

  return nextSlots;
}

function getSeedBands(seedCount: number): { start: number; end: number }[] {
  const bands: { start: number; end: number }[] = [];
  let start = 1;
  let size = 1;

  while (start <= seedCount) {
    const end = Math.min(seedCount, start + size - 1);
    bands.push({ start, end });
    start = end + 1;
    size = start === 2 ? 1 : size * 2;
  }

  return bands;
}

function compareSeededEntrants(a: Entrant, b: Entrant): number {
  return (getNumericSeedNo(a) ?? Number.MAX_SAFE_INTEGER) - (getNumericSeedNo(b) ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}

function addUniquePosition(positions: number[], position: number, drawSize: DrawSize, targetCount: number): void {
  if (positions.length >= targetCount) {
    return;
  }

  if (Number.isInteger(position) && position >= 1 && position <= drawSize && !positions.includes(position)) {
    positions.push(position);
  }
}

function cloneSlots(slots: readonly DrawSlot[]): DrawSlot[] {
  return slots.map((slot) => ({ ...slot }));
}
