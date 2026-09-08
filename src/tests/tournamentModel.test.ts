import { describe, expect, it } from "vitest";
import {
  applyBasicInfoPatch,
  applyEntrantsUpdate,
  applyOptionsPatch,
  applyOutputOptionsPatch,
  createDefaultTournament,
  createEmptyEntrant,
  createEmptyEntrants,
  createGenerationInputSignature,
  completeTournament,
  ensureEntrantRows,
  generateTournamentDraw,
  getEntrantStats,
  getTournamentCompletionErrors,
  getVisibleEntrantRowCount,
  hasTournamentContentChanged,
  isTournamentDrawCurrent,
  mergeEntrantsIntoEmptyRows,
  parseEntrantsFromText,
  reopenTournament,
  touchTournament,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { makeEntrant } from "./testFactory";

const generatedDraw = {
  id: "draw-1",
  tournamentId: "tournament-1",
  randomSeed: "seed-1",
  slots: [],
  matches: [],
  generatedAt: "2026-07-02T00:00:00.000Z",
};

describe("tournamentModel", () => {
  it("creates a default roster with enough rows for the default draw size", () => {
    const tournament = createDefaultTournament();

    expect(tournament.drawSize).toBe(16);
    expect(tournament.entrants).toHaveLength(16);
    expect(tournament.status).toBe("inProgress");
  });

  it("対戦カード確定済みなら試合結果未入力でも完了でき、再開時は試合データを保持する", () => {
    const tournament = createCompletedTournament();
    const incomplete = {
      ...tournament,
      matchSelectionStatus: "confirmed" as const,
      generatedDraw: { ...tournament.generatedDraw!, matches: tournament.generatedDraw!.matches.map((match) => ({ ...match, result: "unplayed" as const })) },
    };

    expect(getTournamentCompletionErrors(incomplete)).toEqual([]);
    expect(completeTournament(incomplete).status).toBe("completed");
    expect(getTournamentCompletionErrors(tournament)).toEqual([]);
    expect(completeTournament(tournament).status).toBe("completed");
    expect(reopenTournament({ ...tournament, status: "completed" })).toMatchObject({ status: "inProgress", generatedDraw: tournament.generatedDraw });
  });

  it("creates a team roster row with a team name and variable member list", () => {
    expect(createEmptyEntrant(1, "team")).toMatchObject({
      teamName: "",
      memberNames: [""],
      team1: "",
      player1Name: "",
    });
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

  it("shows only the draw size when stored rows beyond it are completely blank", () => {
    const rows = createEmptyEntrants(32, "singles").map((entrant, index) => (
      index < 4 ? { ...entrant, player1Name: `Player ${index + 1}` } : entrant
    ));

    expect(getVisibleEntrantRowCount(rows, 8)).toBe(8);
    expect(rows).toHaveLength(32);
  });

  it("keeps a row beyond the draw size visible when it contains incomplete input", () => {
    const rows = createEmptyEntrants(32, "singles");
    rows[19] = { ...rows[19], team1: "Team A" };

    expect(getVisibleEntrantRowCount(rows, 8)).toBe(20);
  });

  it("identifies participant overflow while leaving the BYE count unavailable", () => {
    const overflow = getEntrantStats({
      ...createDefaultTournament(),
      drawSize: 4,
      entrants: Array.from({ length: 5 }, (_, index) => makeEntrant(index + 1)),
    });
    const boundary = getEntrantStats({
      ...createDefaultTournament(),
      drawSize: 4,
      entrants: Array.from({ length: 4 }, (_, index) => makeEntrant(index + 1)),
    });

    expect(overflow).toMatchObject({
      activeEntrantCount: 5,
      hasEntrantOverflow: true,
      byeCount: undefined,
    });
    expect(boundary).toMatchObject({
      activeEntrantCount: 4,
      hasEntrantOverflow: false,
      byeCount: 0,
    });
  });

  it("classifies the assigned seed count against the configured seed count", () => {
    const entrants = [
      { ...makeEntrant(1), seedNo: 1 },
      { ...makeEntrant(2), seedNo: 2 },
      makeEntrant(3),
    ];

    expect(getEntrantStats({
      ...createDefaultTournament(),
      seedCount: 4,
      entrants,
    })).toMatchObject({
      seedAssignedCount: 2,
      seedAssignmentStatus: "shortage",
    });
    expect(getEntrantStats({
      ...createDefaultTournament(),
      seedCount: 2,
      entrants,
    })).toMatchObject({
      seedAssignedCount: 2,
      seedAssignmentStatus: "matched",
    });
    expect(getEntrantStats({
      ...createDefaultTournament(),
      seedCount: 0,
      entrants,
    })).toMatchObject({
      seedAssignedCount: 2,
      seedAssignmentStatus: "excess",
    });
  });

  it("treats a timestamp-only difference as unchanged tournament content", () => {
    const tournament = createDefaultTournament();
    const timestampOnlyUpdate = {
      ...tournament,
      updatedAt: "2026-08-18T00:00:00.000Z",
    };

    expect(hasTournamentContentChanged(tournament, timestampOnlyUpdate)).toBe(false);
  });

  it("detects an actual tournament content change and assigns the supplied timestamp", () => {
    const tournament = createDefaultTournament();
    const changed = { ...tournament, title: "Updated title" };
    const updated = touchTournament(changed, "2026-08-18T00:00:00.000Z");

    expect(hasTournamentContentChanged(tournament, changed)).toBe(true);
    expect(updated.updatedAt).toBe("2026-08-18T00:00:00.000Z");
    expect(tournament.updatedAt).not.toBe(updated.updatedAt);
  });

  it("ignores complete blank rows during validation without removing them", () => {
    const tournament = {
      ...createDefaultTournament(),
      entrants: [makeEntrant(1), createEmptyEntrant(2, "singles")],
    };
    const validation = validateTournamentForUi(tournament);

    expect(validation.errors.map((issue) => issue.code)).not.toContain("PLAYER_NAME_REQUIRED");
    expect(tournament.entrants).toHaveLength(2);
  });

  it("generates one BYE from 15 entrants and one complete blank row while preserving all 16 rows", () => {
    const tournament = {
      ...createDefaultTournament(),
      entrants: [
        ...Array.from({ length: 15 }, (_, index) => makeEntrant(index + 1)),
        createEmptyEntrant(16, "singles"),
      ],
    };
    const result = generateTournamentDraw(tournament, "blank-row-check");

    expect(result.draw).toBeDefined();
    expect(result.validation.errors.map((issue) => issue.code)).not.toContain("PLAYER_NAME_REQUIRED");
    expect(result.draw?.slots.filter((slot) => slot.isBye)).toHaveLength(1);
    expect(result.tournament.options.randomSeed).toBe("blank-row-check");
    expect(result.draw?.generationInputSignature).toBe(createGenerationInputSignature(result.tournament));
    expect(isTournamentDrawCurrent(result.tournament)).toBe(true);
    expect(result.tournament.entrants).toHaveLength(16);
    expect(result.tournament.entrants).toEqual(tournament.entrants);
  });

  it("keeps a partially entered row as an error and blocks generation", () => {
    const incompleteEntrant = {
      ...createEmptyEntrant(2, "singles"),
      team1: "Team A",
    };
    const tournament = {
      ...createDefaultTournament(),
      entrants: [makeEntrant(1), incompleteEntrant],
    };
    const validation = validateTournamentForUi(tournament);
    const result = generateTournamentDraw(tournament, "incomplete-row-check");

    expect(validation.errors.map((issue) => issue.code)).toContain("PLAYER_NAME_REQUIRED");
    expect(result.draw).toBeUndefined();
    expect(result.tournament.entrants).toEqual(tournament.entrants);
  });

  it("fills existing blank rows from pasted entrants without deleting unused blank rows", () => {
    const blank1 = createEmptyEntrant(1, "singles");
    const blank2 = createEmptyEntrant(2, "singles");
    const incoming = makeEntrant(3);

    const merged = mergeEntrantsIntoEmptyRows([blank1, blank2], [incoming]);

    expect(merged).toEqual([incoming, blank2]);
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

  it("parses team names, slash-separated members, and affiliations from team roster text", () => {
    const rows = parseEntrantsFromText(
      [
        "No,シード,チーム名,メンバー（/区切り）,所属チーム,地区,ランキング",
        "1,1,Team A,Member A / Member B,Affiliation A,East,10",
      ].join("\n"),
      "team",
    );

    expect(rows[0]).toMatchObject({
      teamName: "Team A",
      memberNames: ["Member A", "Member B"],
      team1: "Affiliation A",
      region: "East",
      ranking: 10,
    });
    expect(rows[0].id).not.toBe(rows[0].teamName);
  });

  it("parses team roster columns without a seed column", () => {
    const rows = parseEntrantsFromText(
      [
        "1,Team A,Member A/Member B,Affiliation A,East,10",
        "2,Team B,Member C,Affiliation B,West,20",
      ].join("\n"),
      "team",
    );

    expect(rows[0]).toMatchObject({
      teamName: "Team A",
      memberNames: ["Member A", "Member B"],
      team1: "Affiliation A",
      region: "East",
      ranking: 10,
    });
    expect(rows[0].seedNo).toBeUndefined();
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

    expect(updated.generatedDraw).toMatchObject(generatedDraw);
    expect(updated.generatedDraw?.generationInputSignature).toBeDefined();
    expect(isTournamentDrawCurrent(updated)).toBe(true);
  });

  it("automatically regenerates after a valid generation-related basic change", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const changed = applyBasicInfoPatch(tournament, { drawSize: 32 });

    expect(changed.generatedDraw).toBeDefined();
    expect(changed.generatedDraw?.id).not.toBe(generatedDraw.id);
    expect(changed.generatedDraw?.randomSeed).toBe(generatedDraw.randomSeed);
    expect(isTournamentDrawCurrent(changed)).toBe(true);
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

    expect(withBlankRows.generatedDraw).toBeDefined();
    expect(compactedAgain.generatedDraw).toBeDefined();
    expect(isTournamentDrawCurrent(withBlankRows)).toBe(true);
    expect(isTournamentDrawCurrent(compactedAgain)).toBe(true);
  });

  it("automatically regenerates after a valid active roster change", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const changed = applyEntrantsUpdate(tournament, [{ ...entrant, player1Name: "Changed Player" }]);

    expect(changed.generatedDraw).toBeDefined();
    expect(changed.generatedDraw?.id).not.toBe(generatedDraw.id);
    expect(changed.generatedDraw?.randomSeed).toBe(generatedDraw.randomSeed);
    expect(isTournamentDrawCurrent(changed)).toBe(true);
  });

  it("automatically regenerates after an entrant is added", () => {
    const entrant = makeEntrant(1);
    const addedEntrant = makeEntrant(2);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const changed = applyEntrantsUpdate(tournament, [entrant, addedEntrant]);

    expect(changed.generatedDraw).toBeDefined();
    expect(changed.generatedDraw?.id).not.toBe(generatedDraw.id);
    expect(isTournamentDrawCurrent(changed)).toBe(true);
  });

  it("automatically regenerates when a referenced entrant is deleted and the remaining roster is valid", () => {
    const removedEntrant = makeEntrant(1);
    const remainingEntrant = makeEntrant(2);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [removedEntrant, remainingEntrant],
      generatedDraw: {
        ...generatedDraw,
        slots: [{ position: 1, entrantId: removedEntrant.id, isBye: false }],
      },
    };

    const updated = applyEntrantsUpdate(tournament, [remainingEntrant]);

    expect(updated.generatedDraw).toBeDefined();
    expect(updated.generatedDraw?.slots.some((slot) => slot.entrantId === removedEntrant.id)).toBe(false);
    expect(isTournamentDrawCurrent(updated)).toBe(true);
  });

  it("automatically regenerates after an invalid empty roster is corrected", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw: {
        ...generatedDraw,
        slots: [{ position: 1, entrantId: entrant.id, isBye: false }],
      },
    };
    const invalid = applyEntrantsUpdate(tournament, []);
    const corrected = applyEntrantsUpdate(invalid, [makeEntrant(2)]);

    expect(invalid.generatedDraw).toBeUndefined();
    expect(invalid.options.randomSeed).toBe(generatedDraw.randomSeed);
    expect(corrected.generatedDraw).toBeDefined();
    expect(corrected.generatedDraw?.randomSeed).toBe(generatedDraw.randomSeed);
    expect(isTournamentDrawCurrent(corrected)).toBe(true);
  });

  it("is ungenerated while a roster edit has errors and automatically regenerates after correction", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const invalid = applyEntrantsUpdate(tournament, [{
      ...entrant,
      player1Name: "",
      team1: "Team A",
    }]);
    const corrected = applyEntrantsUpdate(invalid, [{
      ...entrant,
      player1Name: "Corrected Player",
      team1: "Team A",
    }]);

    expect(invalid.generatedDraw).toBeUndefined();
    expect(invalid.options.randomSeed).toBe(generatedDraw.randomSeed);
    expect(isTournamentDrawCurrent(invalid)).toBe(false);
    expect(corrected.generatedDraw).toBeDefined();
    expect(corrected.generatedDraw?.id).not.toBe(generatedDraw.id);
    expect(isTournamentDrawCurrent(corrected)).toBe(true);
  });

  it("keeps generated draw when an option patch does not change values", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyOptionsPatch(tournament, { seedPositionMode: tournament.options.seedPositionMode });

    expect(updated.generatedDraw).toMatchObject(generatedDraw);
    expect(isTournamentDrawCurrent(updated)).toBe(true);
  });

  it("automatically regenerates after a generation option change", () => {
    const entrant = makeEntrant(1);
    const tournament = {
      ...createDefaultTournament(),
      entrants: [entrant],
      generatedDraw,
    };
    const changed = applyOptionsPatch(tournament, { seedPositionMode: "fixed" });

    expect(changed.generatedDraw).toBeDefined();
    expect(changed.generatedDraw?.id).not.toBe(generatedDraw.id);
    expect(changed.generatedDraw?.randomSeed).toBe(generatedDraw.randomSeed);
    expect(isTournamentDrawCurrent(changed)).toBe(true);
  });

  it("does not generate automatically before the first explicit generation", () => {
    const tournament = {
      ...createDefaultTournament(),
      entrants: [makeEntrant(1)],
    };

    const changed = applyOptionsPatch(tournament, { seedPositionMode: "fixed" });

    expect(changed.generatedDraw).toBeUndefined();
    expect(isTournamentDrawCurrent(changed)).toBe(false);
  });

  it("keeps generated draw when display output options change", () => {
    const tournament = {
      ...createDefaultTournament(),
      generatedDraw,
    };
    const updated = applyOutputOptionsPatch(tournament, {
      bracketLayout: "bothSides",
      outputPageCount: 2,
      lineWeight: "bold",
    });

    expect(updated.outputOptions).toMatchObject({
      bracketLayout: "bothSides",
      outputPageCount: 2,
      lineWeight: "bold",
    });
    expect(updated.generatedDraw).toMatchObject(generatedDraw);
    expect(isTournamentDrawCurrent(updated)).toBe(true);
  });
});

function createCompletedTournament() {
  const tournament = createDefaultTournament();
  const entrants = Array.from({ length: 4 }, (_, index) => makeEntrant(index + 1));
  const slots = entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
  const matches = [
    { id: "match-1", round: 1, matchNo: 1, sourceA: { slotPosition: 1 }, sourceB: { slotPosition: 2 }, result: "participantAWin" as const },
    { id: "match-2", round: 1, matchNo: 2, sourceA: { slotPosition: 3 }, sourceB: { slotPosition: 4 }, result: "participantAWin" as const },
    { id: "match-3", round: 2, matchNo: 1, sourceA: { matchId: "match-1" }, sourceB: { matchId: "match-2" }, result: "participantAWin" as const },
  ];
  return {
    ...tournament,
    drawSize: 4 as const,
    entrants,
    generatedDraw: {
      id: "draw-completed",
      tournamentId: tournament.id,
      randomSeed: "seed-completed",
      slots,
      matches,
      generatedAt: "2026-09-03T00:00:00.000Z",
    },
    matchSelectionStatus: "confirmed" as const,
  };
}
