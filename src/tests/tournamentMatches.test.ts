import { describe, expect, it } from "vitest";
import { createTournamentMatches, resolveTournamentMatches, updateTournamentMatch } from "../domain/tournamentMatches";
import type { DrawSlot, Entrant, GeneratedDraw } from "../domain/types";

describe("tournament match resolution", () => {
  it("creates every round and links later cards to the previous round", () => {
    const slots = createSlots(8);
    const matches = createTournamentMatches(slots, 8);

    expect(matches).toHaveLength(7);
    expect(matches.filter((match) => match.round === 1)).toHaveLength(4);
    expect(matches.filter((match) => match.round === 3)).toHaveLength(1);
    expect(matches[4]?.sourceA).toEqual({ matchId: matches[0]?.id });
    expect(matches[4]?.sourceB).toEqual({ matchId: matches[1]?.id });
  });

  it("propagates winners through the final and returns the champion draw number", () => {
    let draw = makeDraw(4);
    draw = updateTournamentMatch(draw, "match-1", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-2", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-3", { result: "participantAWin", note: "決勝" });

    const matches = resolveTournamentMatches(draw, entrants(4));
    expect(matches.find((match) => match.id === "match-3")).toMatchObject({
      state: "completed",
      winnerEntrantId: "entrant-1",
    });
    expect(draw.slots.find((slot) => slot.entrantId === "entrant-1")?.position).toBe(1);
  });

  it("automatically advances one participant against a BYE without enabling a result", () => {
    const slots = createSlots(4).map((slot) => slot.position === 2 ? { ...slot, entrantId: undefined, isBye: true } : slot);
    const draw = makeDraw(4, slots);
    const firstMatch = resolveTournamentMatches(draw, entrants(4)).find((match) => match.id === "match-1");

    expect(firstMatch).toMatchObject({ state: "byeAdvance", winnerEntrantId: "entrant-1" });
  });

  it("resets only changed descendants and removes their old notes", () => {
    let draw = makeDraw(4);
    draw = updateTournamentMatch(draw, "match-1", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-2", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-3", { result: "participantAWin", note: "決勝メモ" });

    const updated = updateTournamentMatch(draw, "match-1", { result: "participantBWin" });
    expect(updated.matches?.find((match) => match.id === "match-1")).toMatchObject({ result: "participantBWin" });
    expect(updated.matches?.find((match) => match.id === "match-2")).toMatchObject({ result: "participantAWin" });
    expect(updated.matches?.find((match) => match.id === "match-3")).toMatchObject({ result: "unplayed" });
    expect(updated.matches?.find((match) => match.id === "match-3")?.note).toBeUndefined();
  });

  it("rejects a result for a card whose two participants are not confirmed", () => {
    const draw = makeDraw(4);

    expect(() => updateTournamentMatch(draw, "match-3", { result: "participantAWin" })).toThrow();
    expect(() => updateTournamentMatch(draw, "match-3", { result: "unplayed", note: "未確定メモ" })).toThrow();
  });
});

function makeDraw(drawSize: 4 | 8, slots = createSlots(drawSize)): GeneratedDraw {
  return {
    id: "draw-1",
    tournamentId: "tournament-1",
    randomSeed: "seed-1",
    slots,
    matches: createTournamentMatches(slots, drawSize),
    generatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function createSlots(count: number): DrawSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    entrantId: `entrant-${index + 1}`,
    isBye: false,
  }));
}

function entrants(count: number): Entrant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `entrant-${index + 1}`,
    player1Name: `Player ${index + 1}`,
  }));
}
