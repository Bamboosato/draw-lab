import type { DrawSize, DrawSlot } from "./types";

export function createEmptySlots(drawSize: DrawSize): DrawSlot[] {
  return Array.from({ length: drawSize }, (_, index) => ({
    position: index + 1,
    isBye: false,
  }));
}

export function getFirstRoundMatchIndex(position: number): number {
  assertPositivePosition(position);
  return Math.floor((position - 1) / 2);
}

export function getHalfIndex(position: number, drawSize: DrawSize): 0 | 1 {
  assertPositionInDraw(position, drawSize);
  return position <= drawSize / 2 ? 0 : 1;
}

export function getQuarterIndex(position: number, drawSize: DrawSize): number {
  assertPositionInDraw(position, drawSize);
  return Math.floor((position - 1) / (drawSize / 4));
}

export function getBlockIndex(position: number, drawSize: DrawSize, blockSize: number): number {
  assertPositionInDraw(position, drawSize);

  if (!Number.isInteger(blockSize) || blockSize <= 0 || drawSize % blockSize !== 0) {
    throw new RangeError("blockSize must be a positive divisor of drawSize.");
  }

  return Math.floor((position - 1) / blockSize);
}

export function getOpponentPosition(position: number): number {
  assertPositivePosition(position);
  return position % 2 === 1 ? position + 1 : position - 1;
}

export function findSlotByPosition(slots: readonly DrawSlot[], position: number): DrawSlot | undefined {
  return slots.find((slot) => slot.position === position);
}

export function isSlotAvailable(slot: DrawSlot | undefined): slot is DrawSlot {
  return Boolean(slot && !slot.entrantId && !slot.isBye);
}

function assertPositivePosition(position: number): void {
  if (!Number.isInteger(position) || position < 1) {
    throw new RangeError("position must be a positive integer.");
  }
}

function assertPositionInDraw(position: number, drawSize: DrawSize): void {
  assertPositivePosition(position);

  if (position > drawSize) {
    throw new RangeError("position must be inside drawSize.");
  }
}
