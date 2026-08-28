// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  downloadAllLeaguesMock,
  downloadLeagueMock,
  navigateMock,
  useLeaguesMock,
} = vi.hoisted(() => ({
  downloadAllLeaguesMock: vi.fn(),
  downloadLeagueMock: vi.fn(),
  navigateMock: vi.fn(),
  useLeaguesMock: vi.fn(),
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeagues: useLeaguesMock,
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

vi.mock("../storage/leagueJson", () => ({
  downloadAllLeagues: downloadAllLeaguesMock,
  downloadLeague: downloadLeagueMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import { LeagueListPage } from "../pages/LeagueListPage";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

beforeEach(() => {
  navigateMock.mockReset();
  downloadAllLeaguesMock.mockReset();
  downloadLeagueMock.mockReset();
  useLeaguesMock.mockReturnValue({
    leagues: [{
      ...createDefaultLeague(),
      id: "league-1",
      title: "春季リーグ",
      eventName: "男子ダブルス",
      date: "2026-09-01",
      venue: "A会場",
      participantType: "doubles",
      capacity: 8,
      matchSelectionStatus: "confirmed",
      status: "scheduled",
      updatedAt: "2026-08-28T00:00:00.000Z",
    }],
    createLeague: () => createDefaultLeague(),
    deleteLeague: vi.fn(),
    duplicateLeague: vi.fn(),
    importLeague: vi.fn(),
    replaceAllLeagues: vi.fn(),
    storageStatus: "ready",
    storageError: undefined,
  });
});

describe("LeagueListPage", () => {
  it("トーナメント一覧と同じ列構成・並び替え・状態サマリーを表示する", () => {
    render(<LeagueListPage />);

    expect(screen.getByRole("columnheader", { name: "大会名" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "種目" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "開催日を近い順に並び替え" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "最終更新を古い順に並び替え" })).toBeTruthy();
    const summary = screen.getByLabelText("リーグ概要");
    expect(Array.from(summary.querySelectorAll("dt"), (node) => node.textContent)).toEqual([
      "全リーグ",
      "編集中",
      "運用中",
      "完了",
    ]);
    expect(screen.getAllByText("運用中")).toHaveLength(2);
    expect(screen.getByText("春季リーグ")).toBeTruthy();
    expect(screen.getByText("男子ダブルス")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "JSON出力" })).toBeNull();
  });

  it("一覧上部の追加アクションに全件バックアップと復元をまとめる", () => {
    render(<LeagueListPage />);

    fireEvent.click(screen.getByRole("button", { name: "リーグ一覧のその他の操作" }));

    expect(screen.getByRole("menuitem", { name: "全リーグをファイルへバックアップ" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "リーグ情報をファイルから復元" })).toBeTruthy();
  });

  it("個別出力・複製・削除を行ごとのその他の操作へまとめる", () => {
    render(<LeagueListPage />);

    fireEvent.click(screen.getByRole("button", { name: "春季リーグのその他の操作" }));

    expect(screen.getByRole("menuitem", { name: "リーグ情報(個別)をファイルへ出力" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "リーグ情報(個別)を複製" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "リーグ情報(個別)を削除" })).toBeTruthy();
  });
});
