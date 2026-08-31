// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, storageStatusMock, updateLeagueMock, useLeagueMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  storageStatusMock: vi.fn(),
  updateLeagueMock: vi.fn(),
  useLeagueMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "league-1" }),
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeague: useLeagueMock,
  useLeagues: () => ({
    updateLeague: updateLeagueMock,
    storageStatus: storageStatusMock(),
    storageError: undefined,
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import type { League, LeagueParticipant } from "../domain/leagueTypes";
import { LeagueMatchesPage } from "../pages/LeagueMatchesPage";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  storageStatusMock.mockReset();
  storageStatusMock.mockReturnValue("ready");
  updateLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue(makeLeague());
});

describe("LeagueMatchesPage", () => {
  it("概要サマリーを対戦カード一覧の上に配置し、画面上の名称を対戦カードに統一する", () => {
    render(<LeagueMatchesPage />);

    const page = document.querySelector(".league-page") as HTMLElement;
    const summary = page.querySelector(".compact-summary-section") as HTMLElement;
    const listSection = screen.getByRole("heading", { name: "対戦カード" }).closest("section") as HTMLElement;

    expect(summary.compareDocumentPosition(listSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(summary.querySelectorAll("dt"), (node) => node.textContent)).toEqual([
      "対戦カード",
      "有効カード",
      "無効カード",
      "確定状態",
    ]);
    expect(screen.getByText("未確定").className).toContain("status-badge league-match-status-pending");
    expect(screen.getByRole("button", { name: "対戦カードを再生成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "対戦カードを確定" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "確定解除" })).toBeNull();
    expect(screen.getByRole("button", { name: "次へ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "次へ" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "有効カードを確定" })).toBeNull();
    expect(screen.getByRole("button", { name: "戻る" }).getAttribute("title")).toBe("グループ設定へ戻る");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("title")).toBe("対戦カードを確定するとリーグ表へ進めます");
    expect(page.textContent).not.toContain("候補カード");
  });

  it("対戦カードの選手名とvsを固定された3列の組み合わせで表示する", () => {
    render(<LeagueMatchesPage />);

    const pair = document.querySelector(".league-matches-table .match-pair");
    expect(pair).toBeTruthy();
    expect(Array.from(pair!.children, (child) => child.textContent)).toEqual(["A", "vs", "B"]);
    expect(pair!.querySelector(".match-vs")?.textContent).toBe("vs");
  });

  it("画面遷移直後の保存中メッセージでレイアウトを変動させない", () => {
    storageStatusMock.mockReturnValue("saving");

    render(<LeagueMatchesPage />);

    expect(screen.queryByText("IndexedDBへ自動保存しています。")).toBeNull();
    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
  });

  it("結果入力前は有効状態を変更できる", () => {
    render(<LeagueMatchesPage />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveProperty("disabled", false);

    fireEvent.click(checkbox);

    expect(updateLeagueMock).toHaveBeenCalledTimes(1);
  });

  it("未確定時は結果入力済みでも対戦カード設定を変更できる", () => {
    const league = makeLeague({
      status: "inProgress",
      matchSelectionStatus: "pending",
      matches: [{ ...makeLeague().matches[0]!, result: "participantAWin" }],
    });
    useLeagueMock.mockReturnValue(league);

    render(<LeagueMatchesPage />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "対戦カードを再生成" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "次へ" })).toHaveProperty("disabled", true);
  });

  it("対戦カードを確定すると確定状態になり、確定前はリーグ表へ進めない", () => {
    render(<LeagueMatchesPage />);

    fireEvent.click(screen.getByRole("button", { name: "対戦カードを確定" }));

    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      matchSelectionStatus: "confirmed",
      status: "scheduled",
    }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("確定後はカード設定を変更できず、確定解除を表示する", () => {
    useLeagueMock.mockReturnValue(makeLeague({ matchSelectionStatus: "confirmed", status: "scheduled" }));

    render(<LeagueMatchesPage />);

    expect(screen.getByRole("status").textContent).toContain("対戦カード確定後は、対戦カードの再生成と有効／無効の変更はできません。");
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "対戦カードを再生成" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "確定解除" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "次へ" })).toHaveProperty("disabled", false);
    expect(screen.getByText("確定").className).toContain("status-badge league-match-status-confirmed");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("title")).toBe("リーグ表へ進む");

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/dashboard");
  });

  it("結果未入力の確定解除は確認なしで未確定へ戻す", () => {
    useLeagueMock.mockReturnValue(makeLeague({ matchSelectionStatus: "confirmed", status: "scheduled" }));

    render(<LeagueMatchesPage />);
    fireEvent.click(screen.getByRole("button", { name: "確定解除" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      matchSelectionStatus: "pending",
      status: "draft",
    }));
  });

  it("結果入力済みの確定解除は確認後にすべての結果をリセットする", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue(makeLeague({
      status: "inProgress",
      matchSelectionStatus: "confirmed",
      matches: [
        { ...base.matches[0]!, result: "participantAWin" },
        { id: "m2", groupId: "g1", order: 2, participantAId: "p1", participantBId: "p2", isValid: false, result: "draw", note: "メモ" },
      ],
    }));

    render(<LeagueMatchesPage />);
    fireEvent.click(screen.getByRole("button", { name: "確定解除" }));

    expect(screen.getByRole("dialog").textContent).toContain("入力済みのすべての対戦結果がリセットされます。");
    expect(updateLeagueMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(updateLeagueMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "確定解除" }));
    fireEvent.click(screen.getByRole("button", { name: "解除して結果をリセット" }));

    const savedLeague = updateLeagueMock.mock.calls[0]?.[0];
    expect(savedLeague).toEqual(expect.objectContaining({ matchSelectionStatus: "pending", status: "draft" }));
    expect(savedLeague.matches.every((match: { result: string }) => match.result === "unplayed")).toBe(true);
    expect(savedLeague.matches[1]?.note).toBe("メモ");
  });
});

function makeLeague(overrides: Partial<League> = {}): League {
  const base = createDefaultLeague();
  const participants: LeagueParticipant[] = [
    { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], team: "", region: "", note: "", selectionStatus: "selected" },
    { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], team: "", region: "", note: "", selectionStatus: "selected" },
  ];
  return {
    ...base,
    id: "league-1",
    capacity: 2,
    participants,
    selection: { mode: "all", selectedParticipantIds: ["p1", "p2"], reserveParticipantIds: [] },
    groups: [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }],
    matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "unplayed" }],
    standings: [],
    status: "draft",
    matchSelectionStatus: "pending",
    ...overrides,
  };
}
