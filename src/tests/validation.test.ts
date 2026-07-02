import { describe, expect, it } from "vitest";
import { validateTournament } from "../domain/validation";
import { makeEntrant, makeTournament, makeTournamentWithEntrantCount } from "./testFactory";

describe("validateTournament", () => {
  it("returns NO_ENTRANTS when there are no valid entrants", () => {
    const result = validateTournament(makeTournament({ entrants: [] }));

    expect(result.errors.map((issue) => issue.code)).toContain("NO_ENTRANTS");
  });

  it("returns ENTRANTS_EXCEED_DRAW_SIZE when valid entrants exceed drawSize", () => {
    const result = validateTournament(makeTournamentWithEntrantCount(5, 4));

    expect(result.errors.map((issue) => issue.code)).toContain("ENTRANTS_EXCEED_DRAW_SIZE");
  });

  it("returns PLAYER_NAME_REQUIRED for a blank singles name", () => {
    const result = validateTournament(
      makeTournament({
        entrants: [makeEntrant(1, { player1Name: " " })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("PLAYER_NAME_REQUIRED");
  });

  it("returns SEED_NO_INVALID for a non numeric seed", () => {
    const result = validateTournament(
      makeTournament({
        entrants: [makeEntrant(1, { seedNo: "abc" })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_NO_INVALID");
  });

  it("warns when the same player name appears more than once", () => {
    const result = validateTournament(
      makeTournament({
        entrants: [
          makeEntrant(1, { player1Name: "Same Player" }),
          makeEntrant(2, { player1Name: "Same Player" }),
        ],
      }),
    );

    expect(result.warnings.map((issue) => issue.code)).toContain("DUPLICATE_PLAYER_NAME");
  });

  it("warns when a doubles entrant has only one player name", () => {
    const result = validateTournament(
      makeTournament({
        matchType: "doubles",
        entrants: [makeEntrant(1, { player1Name: "Player A", player2Name: undefined })],
      }),
    );

    expect(result.warnings.map((issue) => issue.code)).toContain("DOUBLES_PLAYER_MISSING");
  });
});
