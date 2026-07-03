import { describe, expect, it } from "vitest";
import {
  getTournamentStepAccess,
  getTournamentStepPath,
  isTournamentStepComplete,
} from "../app/tournamentFlow";
import { createDefaultTournament } from "../app/tournamentModel";
import { makeTournament } from "./testFactory";

describe("tournamentFlow", () => {
  it("blocks tournament generation while roster input has errors", () => {
    const tournament = createDefaultTournament();
    const access = getTournamentStepAccess(tournament, "options");

    expect(access.canEnter).toBe(false);
    expect(access.redirectStep).toBe("entrants");
  });

  it("allows tournament generation after roster errors are resolved", () => {
    const tournament = makeTournament({ drawSize: 4 });
    const access = getTournamentStepAccess(tournament, "options");

    expect(access.canEnter).toBe(true);
  });

  it("blocks preview until a draw has been generated", () => {
    const tournament = makeTournament({ drawSize: 4, generatedDraw: undefined });
    const access = getTournamentStepAccess(tournament, "preview");

    expect(access.canEnter).toBe(false);
    expect(access.redirectStep).toBe("options");
  });

  it("marks generation and preview complete after a draw exists", () => {
    const tournament = makeTournament({
      drawSize: 4,
      generatedDraw: {
        id: "draw-1",
        tournamentId: "tournament-1",
        randomSeed: "seed-1",
        generatedAt: "2026-07-03T00:00:00.000Z",
        slots: [],
      },
    });

    expect(isTournamentStepComplete(tournament, "options")).toBe(true);
    expect(isTournamentStepComplete(tournament, "preview")).toBe(true);
    expect(getTournamentStepAccess(tournament, "preview").canEnter).toBe(true);
  });

  it("builds stable step paths", () => {
    expect(getTournamentStepPath("tournament-1", "options")).toBe("/tournaments/tournament-1/edit/options");
  });
});
