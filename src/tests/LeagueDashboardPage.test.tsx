// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, printMock, saveLeagueMock, useLeagueMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  printMock: vi.fn(),
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
  printMock.mockReset();
  saveLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue(makeLeague());
  document.title = "Draw Lab";
  window.print = printMock;
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
    expect(screen.getByText("各試合の勝者を選択してください。ゲームカウント等の詳細は備考に入力します。")).toBeTruthy();
    expect(document.querySelector(".match-winner-selector")).toBeTruthy();
    expect(screen.getByText("第1試合").className).toContain("match-order-label");
    expect(screen.getByRole("button", { name: "引き分け" })).toHaveProperty("disabled", false);
    expect(screen.getAllByRole("textbox", { name: "備考" }).every((input) => input.getAttribute("placeholder") === "結果の詳細を記録してください（任意）")).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    const resultsPanel = document.querySelector(".league-results-stack") as HTMLElement;
    expect(screen.getByRole("tab", { name: "対戦結果" }).getAttribute("aria-selected")).toBe("true");
    expect(Array.from(resultsPanel.querySelectorAll("h2"), (heading) => heading.textContent)).toEqual(["星取表", "順位表"]);
    expect(resultsPanel.querySelector(".league-matrix thead .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-matrix tbody .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-standings-table thead .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-standings-table tbody .league-participant-column")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "対戦カード" }));
    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "星取表" })).toBeNull();
  });

  it("対戦者名ボタンからリーグの勝敗を保存する", () => {
    render(<LeagueDashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Aの勝ち" }));

    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      matches: [expect.objectContaining({ id: "m1", result: "participantAWin" })],
    }));
  });

  it("リーグ表の対戦カードには有効カードだけを表示し、結果状態を未実施／実施済みで示す", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      matches: [
        { ...base.matches[0]!, id: "m1", order: 1, isValid: true, result: "unplayed" },
        { ...base.matches[0]!, id: "m2", order: 2, isValid: true, result: "participantAWin" },
        { ...base.matches[0]!, id: "m3", order: 3, isValid: false, result: "participantBWin" },
      ],
    });

    render(<LeagueDashboardPage />);

    expect(document.querySelectorAll(".league-match-card")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll(".league-match-card .match-card-heading strong"), (heading) => heading.textContent)).toEqual(["第1試合", "第2試合"]);
    expect(screen.getByText("未実施").className).toContain("generated");
    expect(screen.getByText("実施済").className).toContain("league-match-status-confirmed");
    expect(screen.queryByText("無効（集計外）")).toBeNull();
  });

  it("初期表示の自動順位だけでリーグを完了できる", () => {
    render(<LeagueDashboardPage />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "リーグを完了" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "対戦カード設定" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "リーグを完了" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("PDF/印刷は選択中グループの専用印刷文書を対象にブラウザ印刷を起動する", () => {
    useLeagueMock.mockReturnValue(makeLeagueWithParticipants(9));
    render(<LeagueDashboardPage />);

    const printButton = screen.getByRole("button", { name: "PDF/印刷" });
    expect((printButton as HTMLButtonElement).disabled).toBe(false);
    expect(printButton.getAttribute("title")).toBe("選択中グループの星取表をPDF保存または印刷");
    expect(document.querySelector(".league-matrix-print-document")).toBeTruthy();
    expect(document.querySelectorAll(".league-matrix-print-diagonal")).toHaveLength(9);
    expect(document.querySelector(".league-matrix-print-diagonal line")?.getAttribute("x1")).toBe("0");
    expect(document.querySelector(".league-matrix-print-diagonal line")?.getAttribute("y1")).toBe("0");
    expect(document.querySelector(".league-matrix-print-diagonal line")?.getAttribute("x2")).toBe("100");
    expect(document.querySelector(".league-matrix-print-diagonal line")?.getAttribute("y2")).toBe("100");

    const printTables = Array.from(document.querySelectorAll<HTMLTableElement>(".league-matrix-print-table"));
    expect(printTables).toHaveLength(2);
    expect(printTables[0].style.width).toBe("190mm");
    expect(printTables[1].style.width).toBe("53.5mm");
    expect(Array.from(printTables[1].querySelectorAll<HTMLElement>(".league-matrix-print-result-column"), (column) => column.style.width)).toEqual(["19.5mm"]);

    fireEvent.click(printButton);

    expect(printMock).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("リーグ_リーグ表-グループA");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Draw Lab");
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

  it("順位表は自動順位と訂正欄を分け、訂正ボタンで保存モードを切り替える", () => {
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(Array.from(document.querySelectorAll(".league-standings-table thead th"), (header) => header.textContent)).toEqual([
      "参加者", "試合", "勝", "分", "負", "勝点", "順位", "訂正",
    ]);
    expect(screen.getByRole("button", { name: "訂正" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("spinbutton")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "訂正" }));
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "訂正を保存" })).toBeTruthy();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Aの訂正順位" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bの訂正順位" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "訂正を保存" }));

    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      standings: expect.arrayContaining([
        expect.objectContaining({ participantId: "p1", manualRank: 2, rankStatus: "confirmed" }),
        expect.objectContaining({ participantId: "p2", manualRank: 1, rankStatus: "confirmed" }),
      ]),
    }));
    expect(screen.getByRole("button", { name: "訂正" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "訂正を保存" })).toBeNull();
  });

  it("完了済みリーグでは訂正ボタンを無効にする", () => {
    useLeagueMock.mockReturnValue({ ...makeLeague(), status: "completed" });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getByRole("button", { name: "訂正" })).toHaveProperty("disabled", true);
  });

  it("星取表では無効の対戦をハイフンで表示し、対角セルを斜線で表示する", () => {
    const league = makeLeague();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: league.matches.map((match) => ({ ...match, isValid: false })),
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.queryByText("無")).toBeNull();
    expect(document.querySelectorAll(".league-matrix-diagonal-cell")).toHaveLength(2);
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("x1")).toBe("0");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("y1")).toBe("0");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("x2")).toBe("100");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("y2")).toBe("100");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("星取表では勝敗を白丸・黒丸・三角で表示する", () => {
    const league = makeLeague();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: [{ ...league.matches[0], result: "participantAWin" }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getAllByText("○")).toHaveLength(1);
    expect(screen.getAllByText("●")).toHaveLength(1);

    cleanup();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: [{ ...league.matches[0], result: "draw" }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "対戦結果" }));

    expect(screen.getAllByText("△")).toHaveLength(2);
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

function makeLeagueWithParticipants(count: number): League {
  const league = makeLeague();
  const participants: LeagueParticipant[] = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: `参加者${index + 1}`,
    participantType: "individual",
    memberNames: [`参加者${index + 1}`],
    selectionStatus: "selected",
  }));

  return {
    ...league,
    capacity: count,
    participants,
    selection: { mode: "all", selectedParticipantIds: participants.map((participant) => participant.id), reserveParticipantIds: [] },
    groups: [{ id: "g1", name: "A", participantIds: participants.map((participant) => participant.id) }],
    standings: participants.map((participant) => ({
      groupId: "g1",
      participantId: participant.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      rankStatus: "unconfirmed",
    })),
  };
}
