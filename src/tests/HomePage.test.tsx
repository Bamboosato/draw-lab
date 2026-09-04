// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, useLeaguesMock, useTournamentsMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
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

vi.mock("../components/PwaInstallGuide", () => ({
  PwaInstallGuide: () => <section data-testid="pwa-install-guide" />,
}));

import { createDefaultLeague } from "../app/leagueModel";
import { HomePage } from "../pages/HomePage";
import { makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  useTournamentsMock.mockReturnValue({
    tournaments: [],
    integrations: [],
    storageStatus: "ready",
    storageError: undefined,
  });
  useLeaguesMock.mockReturnValue({
    leagues: [],
    storageStatus: "ready",
    storageError: undefined,
  });
});

describe("HomePage", () => {
  it("全体サマリーを表示せず、両カードに全件数と状態別件数を統合して表示する", () => {
    const tournaments = [
      makeTournament({ id: "tournament-editing" }),
      makeTournament({
        id: "tournament-operating",
        generatedDraw: {
          id: "draw-operating",
          tournamentId: "tournament-operating",
          randomSeed: "seed-operating",
          generatedAt: "2026-09-03T00:00:00.000Z",
          slots: [],
          matches: [],
        },
      }),
      makeTournament({ id: "tournament-completed", status: "completed" }),
    ];
    const leagues = [
      createDefaultLeague(),
      { ...createDefaultLeague(), id: "league-operating", status: "scheduled" as const, matchSelectionStatus: "confirmed" as const },
      { ...createDefaultLeague(), id: "league-completed", status: "completed" as const },
    ];
    useTournamentsMock.mockReturnValue({ tournaments, integrations: [], storageStatus: "ready", storageError: undefined });
    useLeaguesMock.mockReturnValue({ leagues, storageStatus: "ready", storageError: undefined });

    render(<HomePage />);

    expect(screen.queryByText("全体サマリー")).toBeNull();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("3件")).toBeTruthy();
    expect(within(cards[1]!).getByText("3件")).toBeTruthy();
    expect(getStatusValues(cards[0]!)).toEqual({ 編集中: "1", 運用中: "1", 完了: "1" });
    expect(getStatusValues(cards[1]!)).toEqual({ 編集中: "1", 運用中: "1", 完了: "1" });
  });

  it("状態別件数が0件でも0を表示し、カード操作の遷移先を維持する", () => {
    render(<HomePage />);

    const cards = screen.getAllByRole("article");
    expect(within(cards[0]!).getByText("0件")).toBeTruthy();
    expect(getStatusValues(cards[0]!)).toEqual({ 編集中: "0", 運用中: "0", 完了: "0" });
    expect(getStatusValues(cards[1]!)).toEqual({ 編集中: "0", 運用中: "0", 完了: "0" });

    fireEvent.click(within(cards[0]!).getByRole("button", { name: "新規作成" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/tournaments/new");
    fireEvent.click(within(cards[0]!).getByRole("button", { name: /一覧を開く/ }));
    expect(navigateMock).toHaveBeenLastCalledWith("/tournaments");
    fireEvent.click(within(cards[1]!).getByRole("button", { name: "新規作成" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/leagues/new");
    fireEvent.click(within(cards[1]!).getByRole("button", { name: /一覧を開く/ }));
    expect(navigateMock).toHaveBeenLastCalledWith("/leagues");
  });

  it("最近更新したデータを既存の更新日時順・再開先で表示し、対象名を開く操作名に含める", () => {
    const tournament = makeTournament({
      id: "recent-tournament",
      title: "新しいトーナメント",
      updatedAt: "2026-09-04T10:00:00.000Z",
    });
    const league = {
      ...createDefaultLeague(),
      id: "recent-league",
      title: "古いリーグ",
      updatedAt: "2026-09-03T10:00:00.000Z",
    };
    useTournamentsMock.mockReturnValue({ tournaments: [tournament], integrations: [], storageStatus: "ready", storageError: undefined });
    useLeaguesMock.mockReturnValue({ leagues: [league], storageStatus: "ready", storageError: undefined });

    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "最近更新したデータ" })).toBeTruthy();
    const recentItems = screen.getAllByRole("listitem");
    expect(recentItems).toHaveLength(2);
    expect(recentItems[0]?.textContent).toContain("新しいトーナメント");
    expect(recentItems[1]?.textContent).toContain("古いリーグ");
    expect(screen.getByRole("button", { name: "新しいトーナメントを開く" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新しいトーナメントを開く" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/tournaments/recent-tournament/edit/options");
  });

  it("画面の順序をカード、最近更新、PWA案内、保存案内に保つ", () => {
    render(<HomePage />);

    const page = document.querySelector(".home-page");
    expect(page).not.toBeNull();
    expect(Array.from(page!.children, (child) => child.className || child.getAttribute("data-testid"))).toEqual([
      "home-heading",
      "home-feature-grid",
      "home-recent-section",
      "pwa-install-guide",
      "home-storage-note",
    ]);
  });
});

function getStatusValues(card: HTMLElement): Record<string, string> {
  const statusList = card.querySelector(".home-status-list");
  if (!statusList) throw new Error("home status list not found");
  return Object.fromEntries(
    Array.from(statusList.querySelectorAll("div"), (row) => [
      row.querySelector("dt")?.textContent ?? "",
      row.querySelector("dd")?.textContent ?? "",
    ]),
  );
}
