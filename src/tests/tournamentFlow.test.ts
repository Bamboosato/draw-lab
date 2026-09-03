import { describe, expect, it } from "vitest";
import {
  TOURNAMENT_STEPS,
  getTournamentEditSteps,
  getTournamentStatus,
  getTournamentStepAccess,
  getTournamentStepPath,
  isTournamentStepComplete,
} from "../app/tournamentFlow";
import { createDefaultTournament } from "../app/tournamentModel";
import { makeTournament } from "./testFactory";

describe("tournamentFlow", () => {
  it("uses the approved labels for the editing flow", () => {
    expect(TOURNAMENT_STEPS.map((step) => step.label)).toEqual([
      "基本情報",
      "名簿入力",
      "オプション設定",
      "対戦カード",
      "トーナメント表",
    ]);
  });

  it("blocks options settings while roster input has errors", () => {
    const tournament = createDefaultTournament();
    const access = getTournamentStepAccess(tournament, "options");

    expect(access.canEnter).toBe(false);
    expect(access.redirectStep).toBe("entrants");
  });

  it("opens basic information directly before a draw is generated", () => {
    const tournament = makeTournament({ drawSize: 4, generatedDraw: undefined });

    expect(getTournamentEditSteps(tournament)).toEqual(["basic"]);
  });

  it("offers all saved editing steps after a draw is generated", () => {
    const tournament = makeTournament({
      drawSize: 4,
      generatedDraw: {
        id: "draw-1",
        tournamentId: "tournament-1",
        randomSeed: "seed-1",
        generatedAt: "2026-07-03T00:00:00.000Z",
        slots: [],
        matches: [],
      },
    });

    expect(getTournamentEditSteps(tournament)).toEqual(["basic", "entrants", "options", "matches"]);
  });

  it("presents tournament status with the same three labels as league status", () => {
    const generated = makeTournament({
      drawSize: 4,
      generatedDraw: {
        id: "draw-1",
        tournamentId: "tournament-1",
        randomSeed: "seed-1",
        generatedAt: "2026-07-03T00:00:00.000Z",
        slots: [],
        matches: [],
      },
    });

    expect(getTournamentStatus(makeTournament({ generatedDraw: undefined }))).toMatchObject({ label: "編集中", category: "editing" });
    expect(getTournamentStatus(generated)).toMatchObject({ label: "運用中", category: "operating" });
    expect(getTournamentStatus({ ...generated, status: "completed" })).toMatchObject({ label: "完了", category: "completed" });
  });

  it("完了済みトーナメントでは編集画面を提供せず、トーナメント表から再開させる", () => {
    const tournament = makeTournament({ status: "completed" });

    expect(getTournamentEditSteps(tournament)).toEqual([]);
    expect(getTournamentStepAccess(tournament, "matches")).toMatchObject({
      canEnter: false,
      redirectStep: "preview",
    });
    expect(getTournamentStepAccess(tournament, "preview").canEnter).toBe(true);
  });

  it("allows options settings after roster errors are resolved", () => {
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
        matches: [],
      },
    });

    expect(isTournamentStepComplete(tournament, "options")).toBe(true);
    expect(isTournamentStepComplete(tournament, "preview")).toBe(true);
    expect(getTournamentStepAccess(tournament, "preview").canEnter).toBe(true);
  });

  it("keeps editing steps available but blocks preview while generated inputs are stale", () => {
    const tournament = makeTournament({
      drawSize: 4,
      generatedDraw: {
        id: "draw-1",
        tournamentId: "tournament-1",
        randomSeed: "seed-1",
        generatedAt: "2026-07-03T00:00:00.000Z",
        generationInputSignature: "stale-signature",
        slots: [],
        matches: [],
      },
    });

    expect(getTournamentEditSteps(tournament)).toEqual(["basic", "entrants", "options", "matches"]);
    expect(isTournamentStepComplete(tournament, "options")).toBe(false);
    expect(isTournamentStepComplete(tournament, "preview")).toBe(false);
    expect(getTournamentStepAccess(tournament, "preview")).toMatchObject({
      canEnter: false,
      redirectStep: "options",
    });
  });

  it("builds stable step paths", () => {
    expect(getTournamentStepPath("tournament-1", "options")).toBe("/tournaments/tournament-1/edit/options");
  });
});
