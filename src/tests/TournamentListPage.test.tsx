// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";

const {
  createTournamentMock,
  getTournamentIntegrationMock,
  navigateMock,
  updateTournamentWithIntegrationMock,
  useLeaguesMock,
  useTournamentsMock,
} = vi.hoisted(() => ({
  createTournamentMock: vi.fn(),
  getTournamentIntegrationMock: vi.fn(),
  navigateMock: vi.fn(),
  updateTournamentWithIntegrationMock: vi.fn(),
  useLeaguesMock: vi.fn(),
  useTournamentsMock: vi.fn(),
}));

vi.mock("../app/TournamentProvider", () => ({
  useTournaments: useTournamentsMock,
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeagues: useLeaguesMock,
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { TournamentListPage } from "../pages/TournamentListPage";
import { createDefaultTournament } from "../app/tournamentModel";

afterEach(cleanup);

beforeEach(() => {
  const tournament = createDefaultTournament();
  const league = {
    ...createDefaultLeague(),
    id: "league-source",
    title: "春季リーグ",
    capacity: 4,
    participants: [1, 2, 3, 4].map((index) => ({
      id: `p${index}`,
      displayName: `チーム${index}`,
      participantType: "team" as const,
      memberNames: [`選手${index}`],
      selectionStatus: "selected" as const,
    })),
    selection: { mode: "all" as const, selectedParticipantIds: ["p1", "p2", "p3", "p4"], reserveParticipantIds: [] },
    groups: [
      { id: "group-a", name: "A組", participantIds: ["p1", "p2"] },
      { id: "group-b", name: "B組", participantIds: ["p3", "p4"] },
    ],
    participantType: "team" as const,
    matchSelectionStatus: "confirmed" as const,
    status: "scheduled" as const,
  };

  navigateMock.mockReset();
  createTournamentMock.mockReset().mockReturnValue(tournament);
  getTournamentIntegrationMock.mockReset().mockReturnValue(undefined);
  updateTournamentWithIntegrationMock.mockReset();
  useLeaguesMock.mockReset().mockReturnValue({ leagues: [league] });
  useTournamentsMock.mockReset().mockReturnValue({
    createTournament: createTournamentMock,
    deleteTournament: vi.fn(),
    duplicateTournament: vi.fn(),
    getTournamentIntegration: getTournamentIntegrationMock,
    storageError: undefined,
    storageStatus: "ready",
    tournaments: [],
    updateTournamentWithIntegration: updateTournamentWithIntegrationMock,
  });
});

describe("TournamentListPage", () => {
  it("意図: リーグ表から作成はダイアログで確認後にトーナメントを作成する", () => {
    render(<TournamentListPage />);

    fireEvent.click(screen.getByRole("button", { name: "トーナメント一覧のその他の操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "リーグ表の参加者名簿からトーナメントを作成" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(createTournamentMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "league-source" } });

    fireEvent.click(screen.getByRole("button", { name: "基本情報へ進む" }));

    expect(createTournamentMock).toHaveBeenCalledTimes(1);
    expect(updateTournamentWithIntegrationMock).toHaveBeenCalledTimes(1);
    const [createdTournament, integration] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(createdTournament).toMatchObject({
      title: "春季リーグ（1-2位）",
      drawSize: 4,
      matchType: "team",
    });
    expect(integration).toMatchObject({
      source: { leagueId: "league-source" },
      rankRange: { min: 1, max: 2 },
    });
    expect(navigateMock).toHaveBeenCalledWith(expect.stringMatching(/^\/tournaments\/[^/]+\/edit\/basic$/));
  });
});
