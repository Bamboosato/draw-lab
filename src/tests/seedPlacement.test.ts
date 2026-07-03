import { describe, expect, it } from "vitest";
import { createEmptySlots, getHalfIndex } from "../domain/bracketStructure";
import { createSeededRandom } from "../domain/random";
import { getSeedPositionLookup, getSeedPositions, placeSeededEntrants } from "../domain/seedPlacement";
import type { DrawOptions } from "../domain/types";
import { makeEntrant } from "./testFactory";

const fixedOptions: DrawOptions = {
  avoidSameTeam: true,
  avoidSameRegion: true,
  prioritizeSeedBye: true,
  seedPositionMode: "fixed",
  thirdFourthSeedPlacement: "tennisRule",
  fixByePositionOnSeedLottery: true,
  entrantPlacementOrder: "largeTeamFirst",
};

describe("seed placement", () => {
  it("calculates macro compatible fixed seed positions", () => {
    expect(getSeedPositions(16, 4, fixedOptions)).toEqual([1, 16, 12, 5]);
    expect(getSeedPositions(16, 4, { ...fixedOptions, thirdFourthSeedPlacement: "standard" })).toEqual([1, 16, 9, 8]);
  });

  it("places the first and second seeds at fixed edges", () => {
    const slots = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants: [makeEntrant(1, { seedNo: 1 }), makeEntrant(2, { seedNo: 2 })],
      drawSize: 16,
      seedCount: 2,
      options: fixedOptions,
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
      options: fixedOptions,
      random: createSeededRandom("seeds"),
    });
    const thirdAndFourth = slots.filter((slot) => slot.seedNo === 3 || slot.seedNo === 4);

    expect(thirdAndFourth.map((slot) => slot.position).sort((a, b) => a - b)).toEqual([5, 12]);
    expect(new Set(thirdAndFourth.map((slot) => getHalfIndex(slot.position, 16)))).toEqual(new Set([0, 1]));
  });

  it("uses JTA rulebook seed lottery reproducibly", () => {
    const randomA = createSeededRandom("lottery");
    const randomB = createSeededRandom("lottery");
    const options: DrawOptions = { ...fixedOptions, seedPositionMode: "jtaRulebook" };

    expect(getSeedPositions(32, 8, options, randomA)).toEqual(getSeedPositions(32, 8, options, randomB));
  });

  it("keeps BYE-side positions fixed when seed lottery swaps third and fourth seeds", () => {
    const fixedByeLookup = getSeedPositionLookup(
      16,
      { ...fixedOptions, seedPositionMode: "jtaRulebook", fixByePositionOnSeedLottery: true },
      () => 0,
    );
    const movingByeLookup = getSeedPositionLookup(
      16,
      { ...fixedOptions, seedPositionMode: "jtaRulebook", fixByePositionOnSeedLottery: false },
      () => 0,
    );

    expect([fixedByeLookup[16], fixedByeLookup[15], fixedByeLookup[14], fixedByeLookup[13]]).toEqual([2, 15, 11, 6]);
    expect([movingByeLookup[16], movingByeLookup[15], movingByeLookup[14], movingByeLookup[13]]).toEqual([2, 15, 6, 11]);
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
      options: fixedOptions,
      random: createSeededRandom("same-rank"),
    });
    const second = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants,
      drawSize: 16,
      seedCount: 8,
      options: fixedOptions,
      random: createSeededRandom("same-rank"),
    });

    expect(first).toEqual(second);
  });
});
