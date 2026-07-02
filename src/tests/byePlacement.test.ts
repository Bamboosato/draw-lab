import { describe, expect, it } from "vitest";
import { createEmptySlots, getOpponentPosition } from "../domain/bracketStructure";
import { calculateByeCount, placeByes } from "../domain/byePlacement";
import { createSeededRandom } from "../domain/random";
import { placeSeededEntrants } from "../domain/seedPlacement";
import { makeEntrant } from "./testFactory";

describe("bye placement", () => {
  it("calculates bye count from draw size and entrant count", () => {
    expect(calculateByeCount(16, 13)).toBe(3);
  });

  it("places BYEs beside seeded entrants when prioritizeSeedBye is true", () => {
    const seededSlots = placeSeededEntrants({
      slots: createEmptySlots(16),
      entrants: [makeEntrant(1, { seedNo: 1 }), makeEntrant(2, { seedNo: 2 })],
      drawSize: 16,
      seedCount: 2,
      random: createSeededRandom("bye-seed"),
    });
    const slots = placeByes({
      slots: seededSlots,
      byeCount: 2,
      drawSize: 16,
      prioritizeSeedBye: true,
      random: createSeededRandom("bye-seed"),
    });

    expect(slots.find((slot) => slot.position === 2)?.isBye).toBe(true);
    expect(slots.find((slot) => slot.position === 15)?.isBye).toBe(true);
  });

  it("avoids BYE versus BYE in the first round when enough non-paired slots exist", () => {
    const slots = placeByes({
      slots: createEmptySlots(16),
      byeCount: 3,
      drawSize: 16,
      prioritizeSeedBye: false,
      random: createSeededRandom("distribute-byes"),
    });
    const byeSlots = slots.filter((slot) => slot.isBye);

    expect(byeSlots).toHaveLength(3);
    expect(
      byeSlots.every((slot) => {
        const opponent = slots.find((candidate) => candidate.position === getOpponentPosition(slot.position));
        return !opponent?.isBye;
      }),
    ).toBe(true);
  });
});
