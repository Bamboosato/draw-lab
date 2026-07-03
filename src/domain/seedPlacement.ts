import { findSlotByPosition } from "./bracketStructure";
import { shuffleWithRandom } from "./random";
import type { DrawOptions, DrawSize, DrawSlot, Entrant, PlaceSeededEntrantsParams } from "./types";
import { getNumericSeedNo } from "./validation";

const DEFAULT_SEED_OPTIONS: Required<Pick<
  DrawOptions,
  "seedPositionMode" | "thirdFourthSeedPlacement" | "fixByePositionOnSeedLottery"
>> = {
  seedPositionMode: "jtaRulebook",
  thirdFourthSeedPlacement: "tennisRule",
  fixByePositionOnSeedLottery: true,
};

export function getSeedPositions(
  drawSize: DrawSize,
  seedCount: number,
  options: Partial<DrawOptions> = DEFAULT_SEED_OPTIONS,
  random: () => number = () => 0,
): number[] {
  const targetCount = Math.max(0, Math.min(drawSize, Math.floor(seedCount)));

  if (targetCount === 0) {
    return [];
  }

  const lookup = getSeedPositionLookup(drawSize, options, random);
  return Array.from({ length: targetCount }, (_, index) => lookup[index + 1]);
}

export function getSeedPositionLookup(
  drawSize: DrawSize,
  options: Partial<DrawOptions> = DEFAULT_SEED_OPTIONS,
  random: () => number = () => 0,
): number[] {
  const resolved = resolveSeedOptions(options);
  const level = Math.log2(drawSize);
  const seedPosition = createSeedPositionPermutation(drawSize, resolved.seedPositionMode, random);
  const table = createSeedTable({
    drawSize,
    level,
    seedPosition,
    useTennisThirdFourthPlacement: resolved.thirdFourthSeedPlacement === "tennisRule",
    fixByePositionOnSeedLottery: resolved.fixByePositionOnSeedLottery,
  });
  const positions = Array.from({ length: drawSize + 1 }, () => 0);

  table.forEach((seedNo, index) => {
    if (seedNo >= 1 && seedNo <= drawSize) {
      positions[seedNo] = index + 1;
    }
  });

  return positions;
}

export function placeSeededEntrants(params: PlaceSeededEntrantsParams): DrawSlot[] {
  const nextSlots = cloneSlots(params.slots);
  const seedPositions = params.seedPositionLookup ?? getSeedPositionLookup(params.drawSize, params.options, params.random);
  const seededEntrants = params.entrants
    .filter((entrant) => {
      const seedNo = getNumericSeedNo(entrant);
      return seedNo !== undefined && seedNo <= params.seedCount;
    });

  for (const band of getSeedBands(params.seedCount)) {
    const bandEntrants = seededEntrants.filter((entrant) => {
      const seedNo = getNumericSeedNo(entrant);
      return seedNo !== undefined && seedNo >= band.start && seedNo <= band.end;
    });
    const assignments = assignInternalSeedNumbers(bandEntrants, band, params.random);

    for (const assignment of assignments) {
      const slot = findSlotByPosition(nextSlots, seedPositions[assignment.internalSeedNo]);

      if (slot && !slot.entrantId && !slot.isBye) {
        slot.entrantId = assignment.entrant.id;
        slot.seedNo = assignment.displaySeedNo;
      }
    }
  }

  return nextSlots;
}

export function getSeedBands(seedCount: number): { start: number; end: number }[] {
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

function assignInternalSeedNumbers(
  entrants: readonly Entrant[],
  band: { start: number; end: number },
  random: () => number,
): { entrant: Entrant; internalSeedNo: number; displaySeedNo: number }[] {
  const availableSeeds = range(band.start, band.end);
  const assignments: { entrant: Entrant; internalSeedNo: number; displaySeedNo: number }[] = [];
  const groups = groupBySeedNo(entrants).sort((a, b) => a.seedNo - b.seedNo);

  for (const group of groups) {
    const orderedEntrants = group.entrants.length > 1
      ? shuffleWithRandom(group.entrants, random)
      : [...group.entrants];
    const preferredSeeds = [
      group.seedNo,
      ...availableSeeds.filter((seedNo) => seedNo !== group.seedNo),
    ].filter((seedNo, index, self) => seedNo >= band.start && seedNo <= band.end && self.indexOf(seedNo) === index);

    for (const entrant of orderedEntrants) {
      const internalSeedNo = preferredSeeds.find((seedNo) => availableSeeds.includes(seedNo));

      if (internalSeedNo === undefined) {
        break;
      }

      assignments.push({ entrant, internalSeedNo, displaySeedNo: group.seedNo });
      availableSeeds.splice(availableSeeds.indexOf(internalSeedNo), 1);
    }
  }

  return assignments;
}

function groupBySeedNo(entrants: readonly Entrant[]): { seedNo: number; entrants: Entrant[] }[] {
  const groups = new Map<number, Entrant[]>();

  for (const entrant of [...entrants].sort(compareSeededEntrants)) {
    const seedNo = getNumericSeedNo(entrant);

    if (seedNo !== undefined) {
      groups.set(seedNo, [...(groups.get(seedNo) ?? []), entrant]);
    }
  }

  return [...groups.entries()].map(([seedNo, groupedEntrants]) => ({ seedNo, entrants: groupedEntrants }));
}

function compareSeededEntrants(a: Entrant, b: Entrant): number {
  return (getNumericSeedNo(a) ?? Number.MAX_SAFE_INTEGER) - (getNumericSeedNo(b) ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}

function resolveSeedOptions(options: Partial<DrawOptions>): typeof DEFAULT_SEED_OPTIONS {
  return {
    seedPositionMode: options.seedPositionMode ?? DEFAULT_SEED_OPTIONS.seedPositionMode,
    thirdFourthSeedPlacement: options.thirdFourthSeedPlacement ?? DEFAULT_SEED_OPTIONS.thirdFourthSeedPlacement,
    fixByePositionOnSeedLottery: options.fixByePositionOnSeedLottery ?? DEFAULT_SEED_OPTIONS.fixByePositionOnSeedLottery,
  };
}

function createSeedPositionPermutation(
  drawSize: DrawSize,
  mode: NonNullable<DrawOptions["seedPositionMode"]>,
  random: () => number,
): number[] {
  const seedPosition = Array.from({ length: drawSize + 1 }, (_, index) => index);
  const lotteryCount = getSeedLotteryCount(drawSize, mode);

  if (lotteryCount < 4) {
    return seedPosition;
  }

  const groupSizes = [2, 4, 4, 4, 8, 8];
  let seedNo = 3;

  for (const groupSize of groupSizes) {
    if (seedNo > lotteryCount) {
      break;
    }

    const shuffled = shuffleWithRandom(range(0, groupSize - 1), random);

    for (const offset of shuffled) {
      if (seedNo > lotteryCount) {
        break;
      }

      seedPosition[seedNo] = seedNo - ((seedNo - 1) % groupSize) + offset;
      seedNo += 1;
    }
  }

  return seedPosition;
}

function getSeedLotteryCount(drawSize: DrawSize, mode: NonNullable<DrawOptions["seedPositionMode"]>): number {
  if (mode === "fixed") {
    return 0;
  }

  if (drawSize >= 128) {
    return mode === "grandSlam" ? 32 : 16;
  }

  if (drawSize >= 64) {
    return 16;
  }

  if (drawSize >= 32) {
    return 8;
  }

  if (drawSize >= 16) {
    return 4;
  }

  return 0;
}

function createSeedTable(params: {
  drawSize: DrawSize;
  level: number;
  seedPosition: number[];
  useTennisThirdFourthPlacement: boolean;
  fixByePositionOnSeedLottery: boolean;
}): number[] {
  let table = [1, 2];

  for (let level = 2; level <= params.level; level += 1) {
    const next: number[] = [];

    table.forEach((seedNo, index) => {
      const oneBasedIndex = index + 1;
      const placedSeedNo = level === params.level ? params.seedPosition[seedNo] : seedNo;
      const opponentSeedNo = params.fixByePositionOnSeedLottery
        ? (2 ** level) + 1 - seedNo
        : (2 ** level) + 1 - placedSeedNo;
      const placeSeedFirst = shouldPlaceSeedFirst(level, oneBasedIndex, params.useTennisThirdFourthPlacement);

      if (placeSeedFirst) {
        next.push(placedSeedNo, opponentSeedNo);
      } else {
        next.push(opponentSeedNo, placedSeedNo);
      }
    });

    table = next;
  }

  return table.filter((seedNo) => seedNo >= 1 && seedNo <= params.drawSize);
}

function shouldPlaceSeedFirst(level: number, oneBasedIndex: number, useTennisThirdFourthPlacement: boolean): boolean {
  if (!useTennisThirdFourthPlacement) {
    return oneBasedIndex % 2 === 1;
  }

  return (level !== 3 && oneBasedIndex % 2 === 1) || (level === 3 && oneBasedIndex < 3);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function cloneSlots(slots: readonly DrawSlot[]): DrawSlot[] {
  return slots.map((slot) => ({ ...slot }));
}
