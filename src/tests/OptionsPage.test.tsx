// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, updateTournamentMock, useTournamentMock, getIntegrationMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  updateTournamentMock: vi.fn(),
  useTournamentMock: vi.fn(),
  getIntegrationMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "tournament-1" }),
}));

vi.mock("../app/TournamentProvider", () => ({
  useTournament: useTournamentMock,
  useTournaments: () => ({
    updateTournament: updateTournamentMock,
    getTournamentIntegration: getIntegrationMock,
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createTournamentMatches, updateTournamentMatch } from "../domain/tournamentMatches";
import { OptionsPage } from "../pages/OptionsPage";
import { makeEntrants, makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateTournamentMock.mockReset();
  getIntegrationMock.mockReset();
  getIntegrationMock.mockReturnValue(undefined);
  useTournamentMock.mockReturnValue(makeTournamentWithCompletedMatch());
});

describe("OptionsPage", () => {
  it("出力形式の変更ではリセット確認を出さず、結果を保持したまま対戦カードへ進む", () => {
    render(<OptionsPage />);

    fireEvent.click(screen.getByRole("radio", { name: "両山" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({
      generatedDraw: expect.objectContaining({
        matches: expect.arrayContaining([expect.objectContaining({ result: "participantAWin" })]),
      }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/tournaments/tournament-1/edit/matches");
  });

  it("対戦カード確定後はリーグと同じ通知パネルで変更不可を案内する", () => {
    useTournamentMock.mockReturnValue({
      ...makeTournamentWithCompletedMatch(),
      matchSelectionStatus: "confirmed",
    });

    render(<OptionsPage />);

    const notice = screen.getByText("対戦カード確定後のため、ドロー構成と配置オプションは変更できません。");
    expect(notice.closest(".flow-notice")).toBeTruthy();
  });
});

function makeTournamentWithCompletedMatch() {
  const tournament = makeTournament({ drawSize: 4, entrants: makeEntrants(4) });
  const slots = tournament.entrants.map((entrant, index) => ({
    position: index + 1,
    entrantId: entrant.id,
    isBye: false,
  }));
  const draw = updateTournamentMatch({
    id: "draw-1",
    tournamentId: tournament.id,
    randomSeed: "seed-1",
    slots,
    matches: createTournamentMatches(slots, 4),
    generatedAt: "2026-09-03T00:00:00.000Z",
  }, "match-1", { result: "participantAWin", note: "結果を保持" });

  return { ...tournament, generatedDraw: draw };
}
