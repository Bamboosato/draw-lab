import { describe, expect, it } from "vitest";
import { buildBracketViewModel } from "../domain/bracketViewModel";
import type { GeneratedDraw } from "../domain/types";
import { makeEntrant, makeTournament } from "./testFactory";

describe("buildBracketViewModel", () => {
  it("converts tournament and draw data into renderer-friendly rows", () => {
    const tournament = makeTournament({
      title: "Summer Cup",
      date: "2026-07-02",
      venue: "Central Court",
      eventName: "Boys Singles",
      entrants: [
        makeEntrant(1, { seedNo: 1, player1Name: "Seed Player", team1: "Team A", region: "East" }),
        makeEntrant(2, { player1Name: "Regular Player", team1: "Team B", region: "West" }),
      ],
    });
    const draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "view-seed",
      generatedAt: "2026-07-02T00:00:00.000Z",
      slots: [
        { position: 2, isBye: true },
        { position: 1, entrantId: "entrant-1", seedNo: 1, isBye: false },
        { position: 3, entrantId: "entrant-2", isBye: false },
        { position: 4, isBye: false },
      ],
    };

    const viewModel = buildBracketViewModel(tournament, draw);

    expect(viewModel).toMatchObject({
      title: "Summer Cup",
      date: "2026-07-02",
      venue: "Central Court",
      eventName: "Boys Singles",
      matchType: "singles",
      drawSize: 16,
    });
    expect(viewModel.rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(viewModel.rows[0]).toEqual({
      position: 1,
      label: "Seed Player",
      player1Label: "Seed Player",
      player2Label: undefined,
      seedNo: 1,
      teamLabel: "Team A",
      team1Label: "Team A",
      team2Label: undefined,
      isBye: false,
    });
    expect(viewModel.rows[1]).toEqual({
      position: 2,
      label: "BYE",
      player1Label: undefined,
      player2Label: undefined,
      seedNo: undefined,
      teamLabel: undefined,
      team1Label: undefined,
      team2Label: undefined,
      isBye: true,
    });
  });

  it("formats doubles labels and team labels without requiring UI logic", () => {
    const tournament = makeTournament({
      matchType: "doubles",
      entrants: [
        makeEntrant(1, {
          player1Name: "Player A",
          player2Name: "Player B",
          team1: "Team A",
          team2: "Team B",
          sameTeam: false,
        }),
      ],
    });
    const draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "view-seed",
      generatedAt: "2026-07-02T00:00:00.000Z",
      slots: [{ position: 1, entrantId: "entrant-1", isBye: false }],
    };

    const viewModel = buildBracketViewModel(tournament, draw);

    expect(viewModel.matchType).toBe("doubles");
    expect(viewModel.rows[0].label).toBe("Player A / Player B");
    expect(viewModel.rows[0].teamLabel).toBe("Team A / Team B");
    expect(viewModel.rows[0].player1Label).toBe("Player A");
    expect(viewModel.rows[0].player2Label).toBe("Player B");
    expect(viewModel.rows[0].team1Label).toBe("Team A");
    expect(viewModel.rows[0].team2Label).toBe("Team B");
  });

  it("keeps one shared team label for same-team doubles", () => {
    const tournament = makeTournament({
      matchType: "doubles",
      entrants: [makeEntrant(1, {
        player1Name: "Player A",
        player2Name: "Player B",
        team1: "Team A",
        team2: "Team A",
        sameTeam: true,
        region: "East",
      })],
    });
    const draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "view-seed",
      generatedAt: "2026-07-02T00:00:00.000Z",
      slots: [{ position: 1, entrantId: "entrant-1", isBye: false }],
    };

    const row = buildBracketViewModel(tournament, draw).rows[0];

    expect(row.team1Label).toBe("Team A");
    expect(row.team2Label).toBeUndefined();
    expect("region" in row).toBe(false);
  });
});
