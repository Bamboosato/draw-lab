// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, saveLeagueMock, useLeagueMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  saveLeagueMock: vi.fn(),
  useLeagueMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "league-1" }),
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeague: useLeagueMock,
  useLeagues: () => ({
    updateLeague: saveLeagueMock,
    storageStatus: "ready",
    storageError: undefined,
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import type { League, LeagueParticipant } from "../domain/leagueTypes";
import { LeagueDashboardPage } from "../pages/LeagueDashboardPage";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  saveLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue(makeLeague());
});

describe("LeagueDashboardPage", () => {
  it("表示タブを対戦カードと対戦結果にまとめ、対戦結果は星取表を順位表の上に表示する", () => {
    render(<LeagueDashboardPage />);

    const groupPanel = screen.getByRole("region", { name: "グループ選択" });
    const contentPanel = screen.getByRole("region", { name: "リーグ表示" });
    expect(groupPanel.querySelector(".tab-label")?.textContent).toBe("グループ");
    expect(groupPanel.querySelector(".group-tab-segment")?.contains(screen.getByRole("tab", { name: /^A$/ }))).toBe(true);
    expect(contentPanel.querySelector(".group-tabs")).toBeNull();
    expect(groupPanel.compareDocumentPosition(contentPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^A$/ }).className).toContain("active");

    const viewTabs = screen.getByRole("tablist", { name: "表示" });
    expect(Array.from(viewTabs.querySelectorAll('[role="tab"]'), (tab) => tab.textContent)).toEqual(["対戦カード", "対戦結果"]);
    expect(screen.getByRole("tab", { name: "対戦カード" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("heading", { name: "星取表" })).toBeNull();
    expect(document.querySelector(".match-card-players.match-pair")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    const resultsPanel = document.querySelector(".league-results-stack") as HTMLElement;
    expect(screen.getByRole("tab", { name: "対戦結果" }).getAttribute("aria-selected")).toBe("true");
    expect(Array.from(resultsPanel.querySelectorAll("h2"), (heading) => heading.textContent)).toEqual(["星取表", "順位表"]);

    fireEvent.click(screen.getByRole("tab", { name: "対戦カード" }));
    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "星取表" })).toBeNull();
  });

  it("初期表示では順位未入力エラーを表示せず、完了時だけ検証する", () => {
    render(<LeagueDashboardPage />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "リーグを完了" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "対戦カード設定" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "リーグを完了" }));

    expect(screen.getByRole("alert").textContent).toContain("グループAの順位をすべて入力してください。");
    expect(saveLeagueMock).not.toHaveBeenCalled();
  });

  it("対戦結果では参加者を表示名とメンバー名の読み取り専用で表示する", () => {
    useLeagueMock.mockReturnValue(makeDoublesLeague());
    render(<LeagueDashboardPage />);

    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getAllByRole("columnheader", { name: "参加者" })).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "ペア01" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "ペア01（佐藤一郎 / 鈴木太郎）" })).toBeNull();
    expect(screen.getAllByText("ペア01（佐藤一郎 / 鈴木太郎）").length).toBeGreaterThan(0);
    expect(screen.getByRole("cell", { name: "ペア01（佐藤一郎 / 鈴木太郎）" })).toBeTruthy();
    expect(document.querySelectorAll(".league-participant-label").length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: /表示名/ })).toBeNull();
    expect(screen.queryByDisplayValue("ペア01")).toBeNull();
  });

  it("星取表では無効の対戦を無と表示する", () => {
    const league = makeLeague();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: league.matches.map((match) => ({ ...match, isValid: false })),
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getAllByText("無")).toHaveLength(2);
    expect(screen.queryByText("-")).toBeNull();
  });

  it("フッターの戻るで対戦カード画面へ、一覧でリーグ一覧へ戻る", () => {
    render(<LeagueDashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/matches");

    fireEvent.click(screen.getByRole("button", { name: "一覧" }));
    expect(navigateMock).toHaveBeenCalledWith("/leagues");
    expect(screen.getByRole("button", { name: "戻る" }).getAttribute("title")).toBe("対戦カード設定へ戻る");
    expect(screen.getByRole("button", { name: "一覧" }).getAttribute("title")).toBe("リーグ一覧へ戻る");
  });
});

function makeLeague(): League {
  const base = createDefaultLeague();
  const participants: LeagueParticipant[] = [
    { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], selectionStatus: "selected" },
    { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], selectionStatus: "selected" },
  ];
  return {
    ...base,
    id: "league-1",
    capacity: 2,
    participants,
    selection: { mode: "all", selectedParticipantIds: ["p1", "p2"], reserveParticipantIds: [] },
    groups: [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }],
    matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "unplayed" }],
    standings: [
      { groupId: "g1", participantId: "p1", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" },
      { groupId: "g1", participantId: "p2", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" },
    ],
    status: "scheduled",
    matchSelectionStatus: "confirmed",
  };
}

function makeDoublesLeague(): League {
  const league = makeLeague();
  const participants: LeagueParticipant[] = [
    { id: "p1", displayName: "ペア01", participantType: "doubles", memberNames: ["佐藤一郎", "鈴木太郎"], selectionStatus: "selected" },
    { id: "p2", displayName: "ペア02", participantType: "doubles", memberNames: ["田中一郎", "高橋太郎"], selectionStatus: "selected" },
  ];
  return { ...league, participants };
}
