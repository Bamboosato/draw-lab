import { describe, expect, it } from "vitest";
import {
  createEmptySlots,
  getFirstRoundMatchIndex,
  getHalfIndex,
  getOpponentPosition,
  getQuarterIndex,
} from "../domain/bracketStructure";

describe("bracket structure", () => {
  it("creates one-based empty slots", () => {
    const slots = createEmptySlots(16);

    expect(slots).toHaveLength(16);
    expect(slots[0]).toEqual({ position: 1, isBye: false });
    expect(slots[15]).toEqual({ position: 16, isBye: false });
  });

  it("calculates first-round opponent positions", () => {
    expect(getOpponentPosition(1)).toBe(2);
    expect(getOpponentPosition(2)).toBe(1);
  });

  it("calculates first-round match index from one-based positions", () => {
    expect(getFirstRoundMatchIndex(1)).toBe(0);
    expect(getFirstRoundMatchIndex(2)).toBe(0);
    expect(getFirstRoundMatchIndex(3)).toBe(1);
  });

  it("calculates half and quarter indexes", () => {
    expect(getHalfIndex(1, 16)).toBe(0);
    expect(getHalfIndex(16, 16)).toBe(1);
    expect(getQuarterIndex(5, 16)).toBe(1);
  });
});
