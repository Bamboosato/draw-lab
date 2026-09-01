import { describe, expect, it } from "vitest";
import { generateDraw } from "../domain/drawGenerator";
import { makeEntrant, makeEntrants, makeTournament, makeTournamentWithEntrantCount } from "./testFactory";

describe("generateDraw", () => {
  it("fills all 16 slots without BYEs for 16 entrants in a 16 draw", () => {
    const result = generateDraw(makeInput(makeTournamentWithEntrantCount(16, 16)));

    expect(result.validation.errors).toEqual([]);
    expect(result.draw?.slots).toHaveLength(16);
    expect(result.draw?.slots.every((slot) => slot.entrantId && !slot.isBye)).toBe(true);
  });

  it("generates a team draw using each team as one draw unit", () => {
    const entrants = Array.from({ length: 4 }, (_, index) => makeEntrant(index + 1, {
      player1Name: "",
      teamName: `Team ${index + 1}`,
      memberNames: [`Member ${index + 1}`],
      team1: `Affiliation ${index + 1}`,
    }));
    const result = generateDraw(makeInput(makeTournament({ matchType: "team", drawSize: 4, entrants })));

    expect(result.validation.errors).toEqual([]);
    expect(result.draw?.slots.filter((slot) => slot.entrantId)).toHaveLength(4);
  });

  it("places three BYEs for 13 entrants in a 16 draw", () => {
    const result = generateDraw(makeInput(makeTournamentWithEntrantCount(13, 16)));

    expect(result.draw?.slots.filter((slot) => slot.isBye)).toHaveLength(3);
  });

  it("reproduces identical slots with the same random seed", () => {
    const tournament = makeTournamentWithEntrantCount(13, 16);

    const first = generateDraw(makeInput(tournament));
    const second = generateDraw(makeInput(tournament));

    expect(first.draw?.slots).toEqual(second.draw?.slots);
  });

  it("uses the caller supplied randomSeed and now values", () => {
    const result = generateDraw(
      makeInput(makeTournamentWithEntrantCount(4, 4), {
        randomSeed: "caller-seed",
        now: "2026-07-03T00:00:00.000Z",
      }),
    );

    expect(result.draw?.randomSeed).toBe("caller-seed");
    expect(result.draw?.generatedAt).toBe("2026-07-03T00:00:00.000Z");
  });

  it("can produce different placement with different random seeds", () => {
    const base = makeTournamentWithEntrantCount(13, 16);
    const first = generateDraw(
      makeInput(
        makeTournament({
          ...base,
          options: { ...base.options, randomSeed: "draw-seed-a" },
        }),
      ),
    );
    const second = generateDraw(
      makeInput(
        makeTournament({
          ...base,
          options: { ...base.options, randomSeed: "draw-seed-b" },
        }),
      ),
    );

    expect(first.draw?.slots).not.toEqual(second.draw?.slots);
  });

  it("places configured seeds at fixed seed positions", () => {
    const result = generateDraw(
      makeInput(
        makeTournament({
          seedCount: 2,
          entrants: [
            makeEntrant(1, { seedNo: 1 }),
            makeEntrant(2, { seedNo: 2 }),
            ...makeEntrants(14).map((entrant, index) => ({
              ...entrant,
              id: `unseeded-${index + 1}`,
              player1Name: `Unseeded ${index + 1}`,
            })),
          ],
        }),
      ),
    );

    expect(result.draw?.slots.find((slot) => slot.position === 1)?.seedNo).toBe(1);
    expect(result.draw?.slots.find((slot) => slot.position === 16)?.seedNo).toBe(2);
  });

  it("returns validation errors without a draw when entrant count exceeds drawSize", () => {
    const result = generateDraw(makeInput(makeTournamentWithEntrantCount(5, 4)));

    expect(result.draw).toBeUndefined();
    expect(result.validation.errors.map((issue) => issue.code)).toContain("ENTRANTS_EXCEED_DRAW_SIZE");
  });

  it("returns validation errors without a draw when seedNo exceeds seedCount", () => {
    const result = generateDraw(
      makeInput(
        makeTournament({
          seedCount: 2,
          entrants: [makeEntrant(1, { seedNo: 3 }), ...makeEntrants(3)],
        }),
      ),
    );

    expect(result.draw).toBeUndefined();
    expect(result.validation.errors.map((issue) => issue.code)).toContain("SEED_NO_EXCEEDS_SEED_COUNT");
  });
});

function makeInput(
  tournament: ReturnType<typeof makeTournament>,
  overrides: { randomSeed?: string; now?: string } = {},
) {
  return {
    tournament,
    randomSeed: overrides.randomSeed,
    now: overrides.now ?? "2026-07-02T00:00:00.000Z",
  };
}
