// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildBracketViewModel } from "../domain/bracketViewModel";
import { DEFAULT_DRAW_OUTPUT_OPTIONS } from "../domain/outputOptions";
import { createTournamentMatches, updateTournamentMatch, updateTournamentMatchSetScore } from "../domain/tournamentMatches";
import type { GeneratedDraw } from "../domain/types";
import { DrawPreview } from "../components/DrawPreview";
import { makeEntrants, makeTournament } from "./testFactory";

describe("DrawPreview winner rendering", () => {
  it("highlights winner paths and displays only the champion draw number", () => {
    const tournament = makeTournament({ drawSize: 4, entrants: makeEntrants(4) });
    const slots = tournament.entrants.map((entrant, index) => ({
      position: index + 1,
      entrantId: entrant.id,
      isBye: false,
    }));
    let draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 4),
      generatedAt: "2026-09-03T00:00:00.000Z",
    };
    draw = updateTournamentMatch(draw, "match-1", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-2", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-3", { result: "participantAWin", note: "表には出さない" });

    const { container } = render(<DrawPreview viewModel={buildBracketViewModel(tournament, draw)} generatedAt={draw.generatedAt} />);

    const winnerPaths = Array.from(container.querySelectorAll<SVGPathElement>(".svg-connector.winner"));
    expect(winnerPaths.length).toBeGreaterThan(0);
    expect(winnerPaths.some((path) => /V .* H /.test(path.getAttribute("d") ?? ""))).toBe(true);
    expect(container.querySelectorAll(".svg-champion-number").length).toBeGreaterThan(0);
    expect(Array.from(container.querySelectorAll(".svg-champion-number"), (node) => node.textContent)).toEqual(
      expect.arrayContaining(["No.1"]),
    );
    expect(container.textContent).not.toContain("表には出さない");
  });

  it("keeps the champion number inside the right edge in single-side layout", () => {
    const tournament = makeTournament({ drawSize: 4, entrants: makeEntrants(4) });
    const slots = tournament.entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
    let draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 4),
      generatedAt: "2026-09-03T00:00:00.000Z",
    };
    draw = updateTournamentMatch(draw, "match-1", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-2", { result: "participantAWin" });
    draw = updateTournamentMatch(draw, "match-3", { result: "participantAWin" });

    const { container } = render(
      <DrawPreview
        viewModel={buildBracketViewModel(tournament, draw)}
        generatedAt={draw.generatedAt}
        renderMode="canvas"
      />,
    );
    const championNumber = container.querySelector<SVGTextElement>(".svg-champion-number");
    const svg = container.querySelector<SVGSVGElement>("svg");

    expect(championNumber?.textContent).toBe("No.1");
    expect(championNumber?.getAttribute("text-anchor")).toBe("end");
    expect(Number(championNumber?.getAttribute("x"))).toBeLessThan(Number(svg?.getAttribute("width")));
  });

  it("renders a one-set score in winner-loser order above the winner line", () => {
    const tournament = makeTournament({ drawSize: 4, matchFormat: 1, entrants: makeEntrants(4) });
    const slots = tournament.entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
    let draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 4, undefined, 1),
      generatedAt: "2026-09-03T00:00:00.000Z",
    };
    draw = updateTournamentMatchSetScore(draw, "match-1", 1, 0, "participantA", 3);
    draw = updateTournamentMatchSetScore(draw, "match-1", 1, 0, "participantB", 6);

    const { container } = render(
      <DrawPreview
        viewModel={buildBracketViewModel(tournament, draw)}
        generatedAt={draw.generatedAt}
      />,
    );

    expect(container.querySelectorAll(".svg-score-winner-loser")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll(".svg-score-winner-loser"), (node) => node.textContent)).toEqual([
      "6-3",
      "6-3",
    ]);
  });

  it("renders WO instead of game scores in both screen and print previews", () => {
    const tournament = makeTournament({ drawSize: 4, matchFormat: 1, entrants: makeEntrants(4) });
    const slots = tournament.entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
    const draw = updateTournamentMatch(
      {
        id: "draw-1",
        tournamentId: tournament.id,
        randomSeed: "view-seed",
        generatedAt: "2026-09-03T00:00:00.000Z",
        slots,
        matches: createTournamentMatches(slots, 4, undefined, 1),
      },
      "match-1",
      { result: "participantAWin", isWalkover: true },
    );

    const { container } = render(<DrawPreview viewModel={buildBracketViewModel(tournament, draw)} generatedAt={draw.generatedAt} />);

    expect(container.querySelectorAll(".svg-score-walkover")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll(".svg-score-walkover"), (node) => node.textContent)).toEqual(["WO", "WO"]);
    expect(container.querySelectorAll(".svg-score-winner-loser")).toHaveLength(0);
  });

  it("renders three-set wins on the participant rows", () => {
    const tournament = makeTournament({ drawSize: 4, matchFormat: 3, entrants: makeEntrants(4) });
    const slots = tournament.entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
    let draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 4, undefined, 3),
      generatedAt: "2026-09-03T00:00:00.000Z",
    };
    const scores = [[6, 4], [3, 6], [6, 1]] as const;
    scores.forEach(([participantA, participantB], setIndex) => {
      draw = updateTournamentMatchSetScore(draw, "match-1", 3, setIndex, "participantA", participantA);
      draw = updateTournamentMatchSetScore(draw, "match-1", 3, setIndex, "participantB", participantB);
    });

    const { container } = render(
      <DrawPreview
        viewModel={buildBracketViewModel(tournament, draw)}
        generatedAt={draw.generatedAt}
        renderMode="canvas"
      />,
    );

    expect(container.querySelector(".svg-score-participant-a")?.textContent).toBe("2");
    expect(container.querySelector(".svg-score-participant-b")?.textContent).toBe("1");
  });

  it("renders scores for matches on the right side of a two-sided bracket", () => {
    const tournament = makeTournament({
      drawSize: 8,
      matchFormat: 1,
      entrants: makeEntrants(8),
      outputOptions: { ...DEFAULT_DRAW_OUTPUT_OPTIONS, bracketLayout: "bothSides" },
    });
    const slots = tournament.entrants.map((entrant, index) => ({ position: index + 1, entrantId: entrant.id, isBye: false }));
    let draw: GeneratedDraw = {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 8, undefined, 1),
      generatedAt: "2026-09-03T00:00:00.000Z",
    };
    draw = updateTournamentMatchSetScore(draw, "match-3", 1, 0, "participantA", 3);
    draw = updateTournamentMatchSetScore(draw, "match-3", 1, 0, "participantB", 6);

    const { container } = render(
      <DrawPreview
        viewModel={buildBracketViewModel(tournament, draw)}
        generatedAt={draw.generatedAt}
        renderMode="canvas"
      />,
    );

    expect(container.querySelector(".svg-score-winner-loser")?.textContent).toBe("6-3");
  });
});
