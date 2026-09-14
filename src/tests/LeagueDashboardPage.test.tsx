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
  it("表示タブを結果入力とリーグ表・順位表にまとめ、リーグ表を順位表の上に表示する", () => {
    render(<LeagueDashboardPage />);

    const groupPanel = screen.getByRole("region", { name: "グループ選択" });
    const contentPanel = screen.getByRole("region", { name: "リーグ表示" });
    expect(groupPanel.querySelector(".tab-label")?.textContent).toBe("グループ");
    expect(groupPanel.querySelector(".group-tab-segment")?.contains(screen.getByRole("tab", { name: /^A$/ }))).toBe(true);
    expect(contentPanel.querySelector(".group-tabs")).toBeNull();
    expect(groupPanel.compareDocumentPosition(contentPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^A$/ }).className).toContain("active");

    const viewTabs = screen.getByRole("tablist", { name: "表示" });
    expect(Array.from(viewTabs.querySelectorAll('[role="tab"]'), (tab) => tab.textContent)).toEqual(["リーグ表・順位表", "結果入力"]);
    expect(screen.getByRole("tab", { name: "結果入力" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "リーグ表・順位表" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "リーグ表" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));
    expect(screen.getByText("各試合の勝敗を選択してください。詳細入力を有効にすると、セットごとのゲーム数を入力できます。")).toBeTruthy();
    expect(document.querySelector(".match-winner-selector")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "詳細入力" }).closest("label")?.getAttribute("title")).toBe("ゲーム数を入力します。ONからOFFに変えると入力済みゲーム数がリセットされます。");
    expect(screen.getByText("第1試合").className).toContain("match-order-label");
    expect(screen.getByRole("button", { name: "引き分け" })).toHaveProperty("disabled", false);
    expect(screen.getAllByRole("textbox", { name: "備考" }).every((input) => input.getAttribute("placeholder") === "試合に関する補足を入力してください（任意）")).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    const resultsPanel = document.querySelector(".league-results-stack") as HTMLElement;
    expect(screen.getByRole("tab", { name: "リーグ表・順位表" }).getAttribute("aria-selected")).toBe("true");
    expect(Array.from(resultsPanel.querySelectorAll("h2"), (heading) => heading.textContent)).toEqual(["リーグ表", "順位表"]);
    expect(screen.getByText("順位は勝点、直接対決、セット率、ゲーム率、グループ内の参加者順で自動計算します。")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "詳細表示" }).closest("label")?.getAttribute("title")).toBe("ゲーム数を表示します。対戦カードの詳細入力ON時のみ利用できます。");
    expect(resultsPanel.querySelector(".league-matrix thead .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-matrix tbody .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-standings-table thead .league-participant-column")).toBeTruthy();
    expect(resultsPanel.querySelector(".league-standings-table tbody .league-participant-column")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));
    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "リーグ表" })).toBeNull();
  });

  it("リーグ表の有効セルから結果入力の該当カードへ移動する", () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      render(<LeagueDashboardPage />);

      const cells = screen.getAllByRole("button", { name: /結果入力へ移動$/ });
      expect(cells).toHaveLength(2);
      fireEvent.click(cells[1]!);

      expect(screen.getByRole("tab", { name: "結果入力" }).getAttribute("aria-selected")).toBe("true");
      const target = document.getElementById("league-match-m1");
      expect(target).toBeTruthy();
      expect(target?.className).toContain("league-match-card-target");
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("リーグ表の対角セルと無効カードは結果入力への移動対象にしない", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      matches: base.matches.map((match) => ({ ...match, isValid: false })),
    });

    render(<LeagueDashboardPage />);

    expect(screen.queryAllByRole("button", { name: /結果入力へ移動$/ })).toHaveLength(0);
  });

  it("対戦者名ボタンからリーグの勝敗を保存する", () => {
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    fireEvent.click(screen.getByRole("button", { name: "Aの勝ち" }));

    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      matches: [expect.objectContaining({ id: "m1", result: "participantAWin" })],
    }));
  });

  it("詳細入力をONにすると試合形式分のセットスコア欄を表示し、入力値を保存する", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({ ...base, matchFormat: 3 });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    const detailInput = screen.getByRole("checkbox", { name: "詳細入力" });
    expect(detailInput).toHaveProperty("checked", false);
    fireEvent.click(detailInput);
    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({ detailInputEnabled: true }));

    cleanup();
    saveLeagueMock.mockReset();
    useLeagueMock.mockReturnValue({
      ...base,
      matchFormat: 3,
      detailInputEnabled: true,
      matches: [{ ...base.matches[0]!, setScores: [
        { participantA: null, participantB: null },
        { participantA: null, participantB: null },
        { participantA: null, participantB: null },
      ] }],
    });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    expect(screen.getAllByRole("spinbutton")).toHaveLength(6);
    fireEvent.change(screen.getByRole("spinbutton", { name: "第1試合 1セット A側ゲーム数" }), { target: { value: "6" } });
    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      matches: [expect.objectContaining({ setScores: expect.arrayContaining([expect.objectContaining({ participantA: 6 })]) })],
    }));
  });

  it("詳細入力で両者のスコアがそろうと、未実施カードの勝者を自動選択する", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      detailInputEnabled: true,
      matches: [{ ...base.matches[0]!, setScores: [{ participantA: 6, participantB: null }] }],
    });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "第1試合 1セット B側ゲーム数" }), { target: { value: "1" } });
    expect(saveLeagueMock).toHaveBeenLastCalledWith(expect.objectContaining({
      matches: [expect.objectContaining({ result: "participantAWin" })],
    }));
  });

  it("勝者を選択した後にWOを記録でき、ゲーム数は変更しない", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      detailInputEnabled: true,
      matches: [{ ...base.matches[0]!, result: "participantAWin", setScores: [{ participantA: 6, participantB: 1 }] }],
    });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    const walkover = screen.getByRole("checkbox", { name: "第1試合 Walk Over" });
    expect((walkover as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(walkover);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saveLeagueMock).toHaveBeenLastCalledWith(expect.objectContaining({
      matches: [expect.objectContaining({
        result: "participantAWin",
        isWalkover: true,
        setScores: [{ participantA: 6, participantB: 1 }],
      })],
    }));
  });

  it("詳細入力をOFFにすると削除確認を表示し、確定後にスコアと詳細表示をOFFにする", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      detailInputEnabled: true,
      detailDisplayEnabled: true,
      matches: [{ ...base.matches[0]!, setScores: [{ participantA: 6, participantB: 1 }] }],
    });
    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "詳細入力" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "詳細入力をOFFします" })).toBeTruthy();
    expect(screen.getByText("入力済みのゲーム数がリセットされますが、よろしいですか？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OFFにする" }));
    expect(saveLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      detailInputEnabled: false,
      detailDisplayEnabled: false,
      matches: [expect.objectContaining({ setScores: [{ participantA: null, participantB: null }] })],
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
    fireEvent.click(screen.getByRole("tab", { name: "結果入力" }));

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
    expect(printButton.getAttribute("title")).toBe("PDF/印刷する内容を選択");
    expect(document.querySelector(".league-matrix-print-document")).toBeTruthy();
    expect(document.querySelector(".league-matrix-print-page")?.className).toContain("set-count-1");
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
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PDF/印刷内容を選択" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "現在の入力内容を表示" })).toHaveProperty("checked", true);
    expect(document.querySelectorAll(".league-matrix-print-table tbody .league-matrix-print-rank-badge")).toHaveLength(18);
    expect(document.querySelectorAll(".league-matrix-print-table thead .league-matrix-print-rank-badge")).toHaveLength(0);
    expect(Array.from(document.querySelectorAll(".league-matrix-print-result-symbol")).filter((element) => element.textContent === "未")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "結果を空欄で表示" }));
    expect(screen.getByRole("radio", { name: "結果を空欄で表示" })).toHaveProperty("checked", true);
    expect(document.querySelectorAll(".league-matrix-print-rank-badge")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "出力する" }));

    expect(printMock).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("リーグ_リーグ表-グループA");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Draw Lab");
  });

  it("結果を空欄で表示する場合も、詳細表示ONのセット数分の行高を確保する", () => {
    const league = makeLeagueWithParticipants(2);
    useLeagueMock.mockReturnValue({ ...league, matchFormat: 3, detailDisplayEnabled: true });
    render(<LeagueDashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "PDF/印刷" }));
    fireEvent.click(screen.getByRole("radio", { name: "結果を空欄で表示" }));

    expect(document.querySelector(".league-matrix-print-page")?.className).toContain("result-mode-blank");
    expect(document.querySelector(".league-matrix-print-page")?.className).toContain("reserves-detail-space");
    expect(document.querySelector(".league-matrix-print-page")?.className).toContain("set-count-3");
  });

  it("リーグ表・順位表では参加者を表示名とメンバー名の読み取り専用で表示する", () => {
    useLeagueMock.mockReturnValue(makeDoublesLeague());
    render(<LeagueDashboardPage />);

    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

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
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(Array.from(document.querySelectorAll(".league-standings-table thead th"), (header) => header.textContent)).toEqual([
      "参加者", "試合", "勝", "分", "負", "勝点", "順位", "訂正",
    ]);
    expect(screen.getByRole("button", { name: "訂正" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "訂正" }).getAttribute("title")).toBe("自動順位を訂正する場合に、訂正順位を入力します。入力した順位は確定順位として扱われます。");
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
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getByRole("button", { name: "訂正" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "訂正" }).getAttribute("title")).toBe("完了済みのリーグは読み取り専用のため、順位を訂正できません。");
  });

  it("リーグ表では無効の対戦をハイフンで表示し、対角セルを斜線で表示する", () => {
    const league = makeLeague();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: league.matches.map((match) => ({ ...match, isValid: false })),
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.queryByText("無")).toBeNull();
    expect(document.querySelectorAll(".league-matrix-diagonal-cell")).toHaveLength(2);
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("x1")).toBe("0");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("y1")).toBe("0");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("x2")).toBe("100");
    expect(document.querySelector(".league-matrix-diagonal-line line")?.getAttribute("y2")).toBe("100");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("リーグ表では勝敗を白丸・黒丸・三角で表示する", () => {
    const league = makeLeague();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: [{ ...league.matches[0], result: "participantAWin" }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getAllByText("○")).toHaveLength(1);
    expect(screen.getAllByText("●")).toHaveLength(1);

    cleanup();
    useLeagueMock.mockReturnValue({
      ...league,
      matches: [{ ...league.matches[0], result: "draw" }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getAllByText("△")).toHaveLength(2);
  });

  it("詳細表示ONのリーグ表では勝敗記号の下にセットごとの詳細を表示する", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      matchFormat: 3,
      detailInputEnabled: true,
      detailDisplayEnabled: true,
      matches: [{
        ...base.matches[0]!,
        result: "participantAWin",
        setScores: [
          { participantA: 6, participantB: 1 },
          { participantA: null, participantB: null },
          { participantA: 6, participantB: 3 },
        ],
      }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getByRole("checkbox", { name: "詳細表示" })).toHaveProperty("checked", true);
    expect(screen.getAllByText("6-1")).toHaveLength(1);
    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.getAllByText("6-3")).toHaveLength(1);
    expect(screen.getByText("1-6")).toBeTruthy();
  });

  it("詳細表示ONの未実施カードでは結果記号を通常の文字ウェイトで表示する", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      detailInputEnabled: true,
      detailDisplayEnabled: true,
      matches: [{ ...base.matches[0]!, result: "unplayed" }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    const unplayedSymbols = document.querySelectorAll(".league-matrix-result-symbol");
    expect(unplayedSymbols).toHaveLength(2);
    expect(Array.from(unplayedSymbols, (element) => element.textContent)).toEqual(["未", "未"]);
  });

  it("詳細表示ONのWOカードではゲーム数の代わりにWOを表示する", () => {
    const base = makeLeague();
    useLeagueMock.mockReturnValue({
      ...base,
      detailInputEnabled: true,
      detailDisplayEnabled: true,
      matches: [{
        ...base.matches[0]!,
        result: "participantAWin",
        isWalkover: true,
        setScores: [{ participantA: 6, participantB: 3 }],
      }],
    });

    render(<LeagueDashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "リーグ表・順位表" }));

    expect(screen.getAllByText("WO")).toHaveLength(2);
    expect(screen.queryByText("6-3")).toBeNull();
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
