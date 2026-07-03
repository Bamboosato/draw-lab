import { describe, expect, it } from "vitest";
import { createDefaultTournament, createEmptyEntrants, ensureEntrantRows, parseEntrantsFromText } from "../app/tournamentModel";

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
});
