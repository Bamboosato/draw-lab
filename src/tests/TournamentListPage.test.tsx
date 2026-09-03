// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("意図: リーグから作成はダイアログで確認後にトーナメントを作成する", () => {
    render(<TournamentListPage />);

    fireEvent.click(screen.getByRole("button", { name: "トーナメント一覧のその他の操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "予選のリーグからトーナメントを作成" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(createTournamentMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });

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

  it("意図: 大会名と種目の間に予選列を追加し、引継ぎ元リーグがある行だけリンクを表示する", () => {
    const sourceLeague = {
      ...createDefaultLeague(),
      id: "league-source",
      title: "富浜予選リーグ",
    };
    const linkedTournament = {
      ...createDefaultTournament(),
      id: "tournament-linked",
      title: "富浜予選（1-2位）",
      venue: "富浜公園",
      eventName: "男子",
    };
    const ordinaryTournament = {
      ...createDefaultTournament(),
      id: "tournament-ordinary",
      title: "通常大会",
      eventName: "女子",
    };
    const integration = {
      tournamentId: linkedTournament.id,
      kind: "league-to-tournament" as const,
      schemaVersion: 1 as const,
      source: {
        leagueId: sourceLeague.id,
        leagueUpdatedAt: sourceLeague.updatedAt,
        matchSelectionStatus: "confirmed" as const,
      },
      sourceParticipantType: sourceLeague.participantType,
      sourceGroupCount: 2,
      rankRange: { min: 1, max: 2 },
      participants: [],
      createdAt: sourceLeague.createdAt,
      updatedAt: sourceLeague.updatedAt,
    };
    getTournamentIntegrationMock.mockImplementation((tournamentId: string) => (
      tournamentId === linkedTournament.id ? integration : undefined
    ));
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentsMock.mockReturnValue({
      createTournament: createTournamentMock,
      deleteTournament: vi.fn(),
      duplicateTournament: vi.fn(),
      getTournamentIntegration: getTournamentIntegrationMock,
      storageError: undefined,
      storageStatus: "ready",
      tournaments: [linkedTournament, ordinaryTournament],
      updateTournamentWithIntegration: updateTournamentWithIntegrationMock,
    });

    render(<TournamentListPage />);

    expect(screen.getByRole("columnheader", { name: "予選" })).toBeTruthy();
    const linkedRow = screen.getByText(linkedTournament.title).closest("tr");
    const ordinaryRow = screen.getByText(ordinaryTournament.title).closest("tr");
    expect(linkedRow).not.toBeNull();
    expect(ordinaryRow).not.toBeNull();
    expect(within(linkedRow!).getByRole("link", { name: "引継ぎ元のリーグを表示" }).getAttribute("href")).toBe(
      "/leagues/league-source/dashboard",
    );
    expect(linkedRow!.querySelector("td:nth-child(2)")?.textContent).toBe("");
    expect(within(linkedRow!).queryByText(/リーグ:/)).toBeNull();
    expect(ordinaryRow!.querySelector("td:nth-child(2)")?.textContent).toBe("");
    expect(within(ordinaryRow!).queryByRole("link", { name: "引継ぎ元のリーグを表示" })).toBeNull();
  });

  it("意図: 引継ぎ元リーグを参照できない場合は予選表示とリンクを空白にする", () => {
    const tournament = {
      ...createDefaultTournament(),
      id: "tournament-orphan",
      title: "引継ぎ元なし大会",
      eventName: "男子",
    };
    getTournamentIntegrationMock.mockReturnValue({
      tournamentId: tournament.id,
      kind: "league-to-tournament",
      schemaVersion: 1,
      source: {
        leagueId: "deleted-league",
        leagueUpdatedAt: "2026-09-02T00:00:00.000Z",
        matchSelectionStatus: "confirmed",
      },
      sourceParticipantType: "individual",
      sourceGroupCount: 2,
      rankRange: { min: 1, max: 2 },
      participants: [],
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    useLeaguesMock.mockReturnValue({ leagues: [] });
    useTournamentsMock.mockReturnValue({
      createTournament: createTournamentMock,
      deleteTournament: vi.fn(),
      duplicateTournament: vi.fn(),
      getTournamentIntegration: getTournamentIntegrationMock,
      storageError: undefined,
      storageStatus: "ready",
      tournaments: [tournament],
      updateTournamentWithIntegration: updateTournamentWithIntegrationMock,
    });

    render(<TournamentListPage />);

    const row = screen.getByText(tournament.title).closest("tr");
    expect(row).not.toBeNull();
    expect(row!.querySelector("td:nth-child(2)")?.textContent).toBe("");
    expect(within(row!).queryByRole("link", { name: "引継ぎ元のリーグを表示" })).toBeNull();
  });

  it("意図: トーナメントの状態をリーグと同じ編集中・運用中・完了で表示する", () => {
    const editing = { ...createDefaultTournament(), id: "tournament-editing", title: "編集中大会" };
    const operating = {
      ...createDefaultTournament(),
      id: "tournament-operating",
      title: "運用中大会",
      generatedDraw: {
        id: "draw-operating",
        tournamentId: "tournament-operating",
        randomSeed: "seed-operating",
        generatedAt: "2026-09-03T00:00:00.000Z",
        slots: [],
        matches: [],
      },
    };
    const completed = { ...createDefaultTournament(), id: "tournament-completed", title: "完了大会", status: "completed" as const };
    useTournamentsMock.mockReturnValue({
      createTournament: createTournamentMock,
      deleteTournament: vi.fn(),
      duplicateTournament: vi.fn(),
      getTournamentIntegration: getTournamentIntegrationMock,
      storageError: undefined,
      storageStatus: "ready",
      tournaments: [editing, operating, completed],
      updateTournamentWithIntegration: updateTournamentWithIntegrationMock,
    });

    render(<TournamentListPage />);

    expect(within(screen.getByText("編集中大会").closest("tr")!).getByText("編集中")).toBeTruthy();
    expect(within(screen.getByText("運用中大会").closest("tr")!).getByText("運用中")).toBeTruthy();
    expect(within(screen.getByText("完了大会").closest("tr")!).getByText("完了")).toBeTruthy();
  });
});
