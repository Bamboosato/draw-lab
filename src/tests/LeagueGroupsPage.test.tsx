// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, updateLeagueMock, useLeagueMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
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
    storageStatus: "ready",
    storageError: undefined,
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import { LeagueGroupsPage } from "../pages/LeagueGroupsPage";
import type { League, LeagueParticipant } from "../domain/leagueTypes";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue(makeLeague());
});

describe("LeagueGroupsPage", () => {
  it("グループ名と名簿No.の昇順で一覧表示し、グループカードを表示しない", () => {
    render(<LeagueGroupsPage />);

    const rows = Array.from(document.querySelectorAll(".league-group-table tbody tr"), (row) =>
      Array.from(row.querySelectorAll("td"), (cell) => cell.textContent?.trim()),
    );

    expect(rows.map((row) => row.slice(0, 4))).toEqual([
      ["A", "1", "A", "所属A"],
      ["A", "3", "C", "所属C"],
      ["B", "2", "B", "所属B"],
    ]);
    expect(rows[0]?.[4]).toBe("東地区");
    expect(rows[0]?.[5]).toBe("備考A");
    expect(document.querySelector(".league-group-card")).toBeNull();
    expect(screen.getByRole("button", { name: "次へ" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "対戦カード作成へ" })).toBeNull();
    expect(screen.getByRole("button", { name: "戻る" }).getAttribute("title")).toBe("名簿入力・選出へ戻る");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("title")).toBe("対戦カードへ進む");
  });

  it("名簿入力と同じ詳細列の開閉操作で地区と備考を切り替える", () => {
    render(<LeagueGroupsPage />);

    const panel = document.querySelector(".league-group-panel");
    expect(panel?.classList.contains("roster-details-collapsed")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "詳細列を開く" }));

    expect(panel?.classList.contains("roster-details-open")).toBe(true);
    expect(screen.getByRole("button", { name: "詳細列を閉じる" })).toBeTruthy();
  });

  it("一覧のグループ変更ボタンから変更先を選択できる", () => {
    render(<LeagueGroupsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "グループ変更" })[0]!);
    expect(screen.getByRole("dialog", { name: "グループ変更" })).toBeTruthy();
    expect(document.querySelectorAll(".league-group-table tbody tr")).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox", { name: "変更先グループ" }), { target: { value: "g2" } });
    fireEvent.click(screen.getByRole("button", { name: "変更する" }));

    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      groups: expect.arrayContaining([
        expect.objectContaining({ id: "g1", participantIds: ["p3"] }),
        expect.objectContaining({ id: "g2", participantIds: ["p2", "p1"] }),
      ]),
    }));
  });

  it("未確定の候補カードがある場合は再生成を案内する", () => {
    useLeagueMock.mockReturnValue(makeLeague({
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p3", participantBId: "p1", isValid: true, result: "unplayed" }],
      matchSelectionStatus: "pending",
    }));
    render(<LeagueGroupsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "グループ変更" })[0]!);
    fireEvent.change(screen.getByRole("combobox", { name: "変更先グループ" }), { target: { value: "g2" } });
    fireEvent.click(screen.getByRole("button", { name: "変更する" }));

    const dialog = screen.getByRole("dialog", { name: "グループを変更します" });
    expect(dialog.textContent).toContain("グループを変更すると、確定前の対戦カード設定がリセットされます。変更してもよろしいですか？");
    expect(screen.getByRole("button", { name: "リセットして反映" })).toBeTruthy();
  });

  it("確定済みの対戦カードがある場合はグループ設定を変更できない", () => {
    useLeagueMock.mockReturnValue(makeLeague({
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p3", participantBId: "p1", isValid: true, result: "unplayed" }],
      matchSelectionStatus: "confirmed",
    }));
    render(<LeagueGroupsPage />);

    expect(screen.getAllByRole("button", { name: "グループ変更" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole("spinbutton", { name: "グループ数" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "自動均等振り分け" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("結果入力後も次へで対戦カード画面へ遷移し、カードを再生成しない", () => {
    useLeagueMock.mockReturnValue(makeLeague({
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p3", participantBId: "p1", isValid: true, result: "participantAWin", note: "結果メモ" }],
      matchSelectionStatus: "confirmed",
      status: "inProgress",
    }));
    render(<LeagueGroupsPage />);

    const nextButton = screen.getByRole("button", { name: "次へ" }) as HTMLButtonElement;
    expect(nextButton.disabled).toBe(false);
    fireEvent.click(nextButton);

    expect(updateLeagueMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/matches");
  });
});

function makeLeague(overrides: Partial<League> = {}): League {
  const base = createDefaultLeague();
  const participants: LeagueParticipant[] = [
    { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], team: "所属A", region: "東地区", note: "備考A", selectionStatus: "selected" },
    { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], team: "所属B", region: "西地区", note: "備考B", selectionStatus: "selected" },
    { id: "p3", displayName: "C", participantType: "individual", memberNames: ["C"], team: "所属C", region: "南地区", note: "備考C", selectionStatus: "selected" },
  ];
  return {
    ...base,
    id: "league-1",
    capacity: 3,
    participants,
    selection: { mode: "all", selectedParticipantIds: ["p1", "p2", "p3"], reserveParticipantIds: [] },
    groups: [
      { id: "g1", name: "A", participantIds: ["p3", "p1"] },
      { id: "g2", name: "B", participantIds: ["p2"] },
    ],
    matches: [],
    standings: [],
    status: "draft",
    matchSelectionStatus: "pending",
    ...overrides,
  };
}
