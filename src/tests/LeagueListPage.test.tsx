// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  downloadAllLeaguesMock,
  downloadLeagueMock,
  navigateMock,
  updateLeagueMock,
  useLeaguesMock,
} = vi.hoisted(() => ({
  downloadAllLeaguesMock: vi.fn(),
  downloadLeagueMock: vi.fn(),
  navigateMock: vi.fn(),
  updateLeagueMock: vi.fn(),
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
import type { League } from "../domain/leagueTypes";
import { LeagueListPage } from "../pages/LeagueListPage";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

beforeEach(() => {
  navigateMock.mockReset();
  downloadAllLeaguesMock.mockReset();
  downloadLeagueMock.mockReset();
  updateLeagueMock.mockReset();
  useLeaguesMock.mockReturnValue(makeLeaguesContext(makeListLeague()));
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

  it("対戦カード確定済みでは編集ボタンから編集画面を選択できる", () => {
    render(<LeagueListPage />);

    fireEvent.click(screen.getByRole("button", { name: "春季リーグの編集画面を選択" }));

    expect(screen.getByRole("menuitem", { name: "基本情報を編集" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "対戦カードを編集" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "対戦カードを編集" }));

    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/matches");
  });

  it("まだ編集段階のリーグでは編集ボタンから基本情報へ直接遷移する", () => {
    useLeaguesMock.mockReturnValue(makeLeaguesContext(makeListLeague({
      status: "draft",
      matchSelectionStatus: "pending",
    })));
    render(<LeagueListPage />);

    const editButton = screen.getByRole("button", { name: "編集" });
    expect(editButton.getAttribute("title")).toBe("基本情報を編集");
    fireEvent.click(editButton);

    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/basic");
  });

  it("完了済みリーグでは編集ボタンからリーグ表を開いて編集再開へ進める", () => {
    useLeaguesMock.mockReturnValue(makeLeaguesContext(makeListLeague({ status: "completed" })));
    render(<LeagueListPage />);

    const editButton = screen.getByRole("button", { name: "編集" });
    expect(editButton.getAttribute("title")).toContain("編集を再開");
    fireEvent.click(editButton);

    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/dashboard");
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

  it("行ごとのその他の操作から勝点設定を開いて保存できる", () => {
    render(<LeagueListPage />);

    fireEvent.click(screen.getByRole("button", { name: "春季リーグのその他の操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "勝点設定を編集" }));

    expect(screen.getByRole("dialog", { name: "勝点設定" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "勝ち" })).toHaveProperty("value", "3");
    expect(screen.getByRole("spinbutton", { name: "引き分け" })).toHaveProperty("value", "1");
    expect(screen.getByRole("spinbutton", { name: "負け" })).toHaveProperty("value", "0");

    fireEvent.change(screen.getByRole("spinbutton", { name: "勝ち" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      scoringPolicy: { winPoints: 5, drawPoints: 1, lossPoints: 0 },
    }));
  });

  it("勝点設定の範囲外入力では保存せずエラーを表示する", () => {
    render(<LeagueListPage />);

    fireEvent.click(screen.getByRole("button", { name: "春季リーグのその他の操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "勝点設定を編集" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "勝ち" }), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert").textContent).toContain("勝点は0〜100の整数で入力してください。");
    expect(updateLeagueMock).not.toHaveBeenCalled();
  });
});

function makeListLeague(overrides: Partial<League> = {}): League {
  return {
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
    ...overrides,
  };
}

function makeLeaguesContext(league: League) {
  return {
    leagues: [league],
    createLeague: () => createDefaultLeague(),
    deleteLeague: vi.fn(),
    duplicateLeague: vi.fn(),
    importLeague: vi.fn(),
    replaceAllLeagues: vi.fn(),
    updateLeague: updateLeagueMock,
    storageStatus: "ready",
    storageError: undefined,
  };
}
