import { describe, expect, it } from "vitest";
import { createEmptySlots, getHalfIndex } from "../domain/bracketStructure";
import { createSeededRandom } from "../domain/random";
import { getSeedPositions, placeSeededEntrants } from "../domain/seedPlacement";
import { makeEntrant } from "./testFactory";

describe("seed placement", () => {
  it("calculates distributed seed positions", () => {
    expect(getSeedPositions(16, 4)).toEqual([1, 16, 8, 9]);
    expect(getSeedPositions(32, 8)).toEqual([1, 32, 16, 17, 8, 9, 24, 25]);
  });

  it("places the first and second seeds at fixed edges", () => {
    const slots = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants: [makeEntrant(1, { seedNo: 1 }), makeEntrant(2, { seedNo: 2 })],
      drawSize: 16,
      seedCount: 2,
      random: createSeededRandom("seeds"),
    });

    expect(slots.find((slot) => slot.position === 1)?.entrantId).toBe("entrant-1");
    expect(slots.find((slot) => slot.position === 16)?.entrantId).toBe("entrant-2");
  });

  it("distributes third and fourth seeds across semifinal blocks", () => {
    const slots = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants: [
        makeEntrant(1, { seedNo: 1 }),
        makeEntrant(2, { seedNo: 2 }),
        makeEntrant(3, { seedNo: 3 }),
        makeEntrant(4, { seedNo: 4 }),
      ],
      drawSize: 16,
      seedCount: 4,
      random: createSeededRandom("seeds"),
    });
    const thirdAndFourth = slots.filter((slot) => slot.seedNo === 3 || slot.seedNo === 4);

    expect(thirdAndFourth.map((slot) => slot.position).sort((a, b) => a - b)).toEqual([8, 9]);
    expect(new Set(thirdAndFourth.map((slot) => getHalfIndex(slot.position, 16)))).toEqual(new Set([0, 1]));
  });

  it("keeps same-rank seed placement reproducible with the same random seed", () => {
    const entrants = [
      makeEntrant(1, { seedNo: 5 }),
      makeEntrant(2, { seedNo: 5 }),
      makeEntrant(3, { seedNo: 7 }),
      makeEntrant(4, { seedNo: 8 }),
    ];
    const first = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants,
      drawSize: 16,
      seedCount: 8,
      random: createSeededRandom("same-rank"),
    });
    const second = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants,
      drawSize: 16,
      seedCount: 8,
      random: createSeededRandom("same-rank"),
    });

    expect(first).toEqual(second);
  });
});
