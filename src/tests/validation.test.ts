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

  it("returns SEED_COUNT_INVALID for negative or decimal seedCount values", () => {
    const negative = validateTournament(makeTournament({ seedCount: -1 }));
    const decimal = validateTournament(makeTournament({ seedCount: 2.5 }));

    expect(negative.errors.map((issue) => issue.code)).toContain("SEED_COUNT_INVALID");
    expect(decimal.errors.map((issue) => issue.code)).toContain("SEED_COUNT_INVALID");
  });

  it("returns SEED_COUNT_UNSUPPORTED for seedCount values outside the PoC set", () => {
    const result = validateTournament(makeTournament({ seedCount: 6 }));

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_COUNT_UNSUPPORTED");
  });

  it("returns SEED_COUNT_EXCEEDS_DRAW_SIZE when seedCount exceeds drawSize", () => {
    const result = validateTournament(makeTournament({ drawSize: 16, seedCount: 32 }));

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_COUNT_EXCEEDS_DRAW_SIZE");
  });

  it("returns SEED_NO_EXCEEDS_SEED_COUNT when seedNo is outside the configured seedCount", () => {
    const result = validateTournament(
      makeTournament({
        seedCount: 2,
        entrants: [makeEntrant(1, { seedNo: 3 })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_NO_EXCEEDS_SEED_COUNT");
  });

  it("allows ranking values from 1 to 9999", () => {
    const result = validateTournament(
      makeTournament({
        entrants: [
          makeEntrant(1, { ranking: 1 }),
          makeEntrant(2, { ranking: 9999 }),
        ],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).not.toContain("RANKING_INVALID");
  });

  it("returns RANKING_INVALID for ranking values outside 1 to 9999", () => {
    const invalidRankings = [0, 10000, 1.5, "abc"];

    for (const ranking of invalidRankings) {
      const result = validateTournament(
        makeTournament({
          entrants: [makeEntrant(1, { ranking })],
        }),
      );

      expect(result.errors.map((issue) => issue.code)).toContain("RANKING_INVALID");
    }
  });

  it("allows same-rank seeds when they fit in the seed placement band", () => {
    const result = validateTournament(
      makeTournament({
        seedCount: 4,
        entrants: [
          makeEntrant(1, { seedNo: 1 }),
          makeEntrant(2, { seedNo: 2 }),
          makeEntrant(3, { seedNo: 3 }),
          makeEntrant(4, { seedNo: 3 }),
        ],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).not.toContain("SEED_DUPLICATION_EXCEEDS_PLACEMENT_SLOTS");
    expect(result.warnings.map((issue) => issue.code)).toContain("UNUSUAL_SEED_DUPLICATION");
  });

  it("returns an error when total same-band seeds exceed their placement band", () => {
    const result = validateTournament(
      makeTournament({
        seedCount: 4,
        entrants: [
          makeEntrant(1, { seedNo: 1 }),
          makeEntrant(2, { seedNo: 2 }),
          makeEntrant(3, { seedNo: 3 }),
          makeEntrant(4, { seedNo: 3 }),
          makeEntrant(5, { seedNo: 4 }),
          makeEntrant(6, { seedNo: 4 }),
        ],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain(
      "SEED_DUPLICATION_EXCEEDS_PLACEMENT_SLOTS",
    );
  });

  it("returns an error when duplicate seedNo values exceed their placement band", () => {
    const result = validateTournament(
      makeTournament({
        seedCount: 4,
        entrants: [
          makeEntrant(1, { seedNo: 1 }),
          makeEntrant(2, { seedNo: 1 }),
          makeEntrant(3, { seedNo: 3 }),
          makeEntrant(4, { seedNo: 4 }),
        ],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_DUPLICATION_EXCEEDS_PLACEMENT_SLOTS");
  });

  it("returns an error when seedCount and assigned seed entrants differ", () => {
    const result = validateTournament(
      makeTournament({
        seedCount: 4,
        entrants: [
          makeEntrant(1, { seedNo: 1 }),
          makeEntrant(2, { seedNo: 2 }),
          makeEntrant(3),
          makeEntrant(4),
        ],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("SEED_COUNT_MISMATCH");
    expect(result.warnings.map((issue) => issue.code)).not.toContain("SEED_COUNT_MISMATCH");
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

  it("returns an error when a doubles entrant has only one player name", () => {
    const result = validateTournament(
      makeTournament({
        matchType: "doubles",
        entrants: [makeEntrant(1, { player1Name: "Player A", player2Name: undefined })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("DOUBLES_PLAYER_MISSING");
  });

  it("returns an error when a doubles row has affiliation but no player names", () => {
    const result = validateTournament(
      makeTournament({
        matchType: "doubles",
        entrants: [makeEntrant(1, { player1Name: "", player2Name: "", team1: "Team A", team2: "Team B" })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("DOUBLES_PLAYER_MISSING");
  });

  it("allows same-team group values up to five characters", () => {
    const result = validateTournament(
      makeTournament({
        matchType: "doubles",
        entrants: [makeEntrant(1, { player1Name: "Player A", player2Name: "Player B", sameTeamGroup: "ABCDE" })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).not.toContain("SAME_TEAM_GROUP_TOO_LONG");
  });

  it("returns an error when same-team group values exceed five characters", () => {
    const result = validateTournament(
      makeTournament({
        matchType: "doubles",
        entrants: [makeEntrant(1, { player1Name: "Player A", player2Name: "Player B", sameTeamGroup: "ABCDEF" })],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toContain("SAME_TEAM_GROUP_TOO_LONG");
  });
});
