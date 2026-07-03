import { describe, expect, it } from "vitest";
import {
  applyBasicInfoPatch,
  applyEntrantsUpdate,
  applyOptionsPatch,
  createDefaultTournament,
  createEmptyEntrant,
  createEmptyEntrants,
  ensureEntrantRows,
  generateTournamentDraw,
  parseEntrantsFromText,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { makeEntrant } from "./testFactory";

const generatedDraw = {
  id: "draw-1",
  tournamentId: "tournament-1",
  randomSeed: "seed-1",
  slots: [],
  generatedAt: "2026-07-02T00:00:00.000Z",
};

describe("tournamentModel", () => {
  it("creates a default roster with enough rows for the default draw size", () => {
    const tournament = createDefaultTournament();

    expect(tournament.drawSize).toBe(16);
    expect(tournament.entrants).toHaveLength(16);
  });

  it("pads entrant rows up to the draw size without removing existing rows", () => {
    const existingEntrants = createEmptyEntrants(8, "singles");
    const rows = ensureEntrantRows(existingEntrants, 16, "singles");

    expect(rows).toHaveLength(16);
    expect(rows.slice(0, existingEntrants.length)).toEqual(existingEntrants);
  });

  it("does not trim rows when existing input already exceeds the draw size", () => {
    const existingEntrants = createEmptyEntrants(20, "singles");
    const rows = ensureEntrantRows(existingEntrants, 16, "singles");

    expect(rows).toHaveLength(20);
  });

  it("keeps complete blank rows as validation errors until they are deleted", () => {
    const tournament = {
      ...createDefaultTournament(),
      entrants: [makeEntrant(1), createEmptyEntrant(2, "singles")],
    };
    const validation = validateTournamentForUi(tournament);

    expect(validation.errors.map((issue) => issue.code)).toContain("PLAYER_NAME_REQUIRED");
  });

  it("does not generate a draw while complete blank rows remain", () => {
    const tournament = {
      ...createDefaultTournament(),
      entrants: [makeEntrant(1), createEmptyEntrant(2, "singles")],
    };
    const result = generateTournamentDraw(tournament, "blank-row-check");

    expect(result.draw).toBeUndefined();
    expect(result.validation.errors.map((issue) => issue.code)).toContain("PLAYER_NAME_REQUIRED");
  });

  it("parses same-team group values from doubles roster text", () => {
    const rows = parseEntrantsFromText(
      [
        "No,シード,選手名1,選手名2,所属チーム1,所属チーム2,同チーム扱い,地区,ランキング",
        "1,1,Player A,Player B,Team A,Team B,G1,East,1",
      ].join("\n"),
      "doubles",
    );

    expect(rows[0].sameTeamGroup).toBe("G1");
  });

  it("ignores a leading No column when singles roster text has no seed column", () => {
    const rows = parseEntrantsFromText(
      [
        "1,Player A,Team A,East,10",
        "2,Player B,Team B,West,20",
      ].join("\n"),
      "singles",
    );

    expect(rows[0]).toMatchObject({
      player1Name: "Player A",
      team1: "Team A",
      region: "East",
      ranking: 10,
    });
    expect(rows[0].seedNo).toBeUndefined();
    expect(rows[1].player1Name).toBe("Player B");
  });

  it("ignores a leading No column when doubles roster text has no seed column", () => {
    const rows = parseEntrantsFromText(
      [
        "1,Player A,Player B,Team A,Team B,G1,East,10",
        "2,Player C,Player D,Team C,Team D,G2,West,20",
      ].join("\n"),
      "doubles",
    );

    expect(rows[0]).toMatchObject({
      player1Name: "Player A",
      player2Name: "Player B",
      team1: "Team A",
      team2: "Team B",
      sameTeamGroup: "G1",
      region: "East",
      ranking: 10,
    });
    expect(rows[0].seedNo).toBeUndefined();
  });

  it("keeps generated draw when only basic display metadata changes", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyBasicInfoPatch(tournament, { title: "Updated title" });

    expect(updated.generatedDraw).toBe(generatedDraw);
  });

  it("clears generated draw when generation-related basic settings change", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyBasicInfoPatch(tournament, { seedCount: 4 });

    expect(updated.generatedDraw).toBeUndefined();
  });

  it("keeps generated draw when only blank roster rows are added or removed", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const withBlankRows = applyEntrantsUpdate(tournament, [entrant, createEmptyEntrant(2, "singles")]);
    const compactedAgain = applyEntrantsUpdate(withBlankRows, [entrant]);

    expect(withBlankRows.generatedDraw).toBe(generatedDraw);
    expect(compactedAgain.generatedDraw).toBe(generatedDraw);
  });

  it("clears generated draw when active roster data changes", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const updated = applyEntrantsUpdate(tournament, [{ ...entrant, player1Name: "Changed Player" }]);

    expect(updated.generatedDraw).toBeUndefined();
  });

  it("keeps generated draw when an option patch does not change values", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyOptionsPatch(tournament, { seedPositionMode: tournament.options.seedPositionMode });

    expect(updated.generatedDraw).toBe(generatedDraw);
  });

  it("clears generated draw when draw generation options change", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyOptionsPatch(tournament, { seedPositionMode: "fixed" });

    expect(updated.generatedDraw).toBeUndefined();
  });
});
