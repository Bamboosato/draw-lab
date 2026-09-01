import { describe, expect, it } from "vitest";
import { createEmptySlots } from "../domain/bracketStructure";
import { calculatePlacementPenalty, PLACEMENT_PENALTY } from "../domain/scoring";
import type { DrawOptions, Entrant } from "../domain/types";
import type { TournamentPlacementContext } from "../domain/leagueTournamentTypes";
import { makeEntrant } from "./testFactory";

const options: DrawOptions = {
  avoidSameTeam: true,
  avoidSameRegion: true,
  prioritizeSeedBye: true,
};

describe("placement scoring", () => {
  it("adds a large penalty for a same-team first-round opponent", () => {
    const placed = makeEntrant(1, { team1: "A", region: "R1" });
    const candidate = makeEntrant(2, { team1: "A", region: "R2" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBeGreaterThanOrEqual(PLACEMENT_PENALTY.sameTeamFirstRound);
  });

  it("treats doubles affiliations as related when either side's team overlaps", () => {
    const placed = makeEntrant(1, { team1: "East", team2: "West", region: "R1" });
    const candidate = makeEntrant(2, { team1: "South", team2: "East", region: "R2" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBeGreaterThanOrEqual(PLACEMENT_PENALTY.sameTeamFirstRound);
  });

  it("uses affiliation rather than the displayed team name for team-event avoidance", () => {
    const placed = makeEntrant(1, { player1Name: "", teamName: "Same Name", team1: "Affiliation A", region: "R1" });
    const candidate = makeEntrant(2, { player1Name: "", teamName: "Same Name", team1: "Affiliation B", region: "R2" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBe(0);
  });

  it("adds same-team penalties when the same-team group matches", () => {
    const placed = makeEntrant(1, { team1: "A", team2: "B", sameTeamGroup: "G1", region: "R1" });
    const candidate = makeEntrant(2, { team1: "C", team2: "D", sameTeamGroup: "G1", region: "R2" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBeGreaterThanOrEqual(PLACEMENT_PENALTY.sameTeamFirstRound);
  });

  it("adds a strong first-round penalty for the same league group and rank", () => {
    const placed = makeEntrant(1);
    const candidate = makeEntrant(2);
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;
    const placementContext: TournamentPlacementContext = {
      rankRange: { min: 1, max: 8 },
      groupCount: 2,
      participants: new Map([
        [placed.id, { tournamentEntrantId: placed.id, groupKey: "g1", rank: 1 }],
        [candidate.id, { tournamentEntrantId: candidate.id, groupKey: "g1", rank: 1 }],
      ]),
    };

    expect(calculatePlacementPenalty({
      entrant: candidate,
      candidatePosition: 1,
      slots,
      entrantsById: new Map([[placed.id, placed]]),
      drawSize: 16,
      options,
      placementContext,
    })).toBeGreaterThanOrEqual(1600);
  });

  it("adds a medium penalty for a same-region first-round opponent", () => {
    const placed = makeEntrant(1, { team1: "A", region: "R1" });
    const candidate = makeEntrant(2, { team1: "B", region: "R1" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBeGreaterThanOrEqual(PLACEMENT_PENALTY.sameRegionFirstRound);
  });

  it("adds quarter penalties for same-team entrants already in the quarter", () => {
    const placed = makeEntrant(1, { team1: "A", region: "R1" });
    const candidate = makeEntrant(2, { team1: "A", region: "R2" });
    const slots = createEmptySlots(16);
    slots[2].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1)).toBeGreaterThanOrEqual(PLACEMENT_PENALTY.sameTeamQuarter);
  });

  it("does not add team penalties when avoidSameTeam is false", () => {
    const placed = makeEntrant(1, { team1: "A", region: "R1" });
    const candidate = makeEntrant(2, { team1: "A", region: "R2" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1, { ...options, avoidSameTeam: false })).toBe(0);
  });

  it("does not add region penalties when avoidSameRegion is false", () => {
    const placed = makeEntrant(1, { team1: "A", region: "R1" });
    const candidate = makeEntrant(2, { team1: "B", region: "R1" });
    const slots = createEmptySlots(16);
    slots[1].entrantId = placed.id;

    expect(score(candidate, [placed], slots, 1, { ...options, avoidSameRegion: false })).toBe(0);
  });
});

function score(
  candidate: Entrant,
  placedEntrants: Entrant[],
  slots: ReturnType<typeof createEmptySlots>,
  candidatePosition: number,
  scoreOptions = options,
): number {
  return calculatePlacementPenalty({
    entrant: candidate,
    candidatePosition,
    slots,
    entrantsById: new Map(placedEntrants.map((entrant) => [entrant.id, entrant])),
    drawSize: 16,
    options: scoreOptions,
  });
}
