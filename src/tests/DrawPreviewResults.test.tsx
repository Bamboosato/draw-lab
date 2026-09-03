// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildBracketViewModel } from "../domain/bracketViewModel";
import { createTournamentMatches, updateTournamentMatch } from "../domain/tournamentMatches";
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
});
