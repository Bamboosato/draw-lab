// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { LeagueParticipantsPage } from "../pages/LeagueParticipantsPage";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue(makeLeague());
});

describe("LeagueParticipantsPage", () => {
  it("新規リーグの名簿入力は定員分の空行を初期表示する", () => {
    useLeagueMock.mockReturnValue({ ...createDefaultLeague(), id: "league-1" });
    render(<LeagueParticipantsPage />);

    expect(document.querySelectorAll(".league-participant-table tbody tr")).toHaveLength(8);
    const summary = document.querySelector('[aria-label="参加者入力概要"]') as HTMLElement;
    expect(Array.from(summary.querySelectorAll("dd"), (node) => node.textContent)).toEqual(["0", "0", "8"]);
    expect(screen.queryByText("参加者を追加してください。")).toBeNull();
  });

  it("既存のグループ・対戦カードがある参加単位更新では、フォーカス離脱時に確認する", () => {
    render(<LeagueParticipantsPage />);
    const input = screen.getByRole("textbox", { name: "1 選手名" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A（更新）" } });
    fireEvent.blur(input);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/対戦方式と勝点設定は保持されます。/))
      .toBeTruthy();
    expect(updateLeagueMock).not.toHaveBeenCalled();
  });

  it("確認をキャンセルすると参加単位と貼り付け内容を変更前の状態に戻す", async () => {
    render(<LeagueParticipantsPage />);
    const input = screen.getByRole("textbox", { name: "1 選手名" }) as HTMLInputElement;
    const paste = screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: "A（更新）" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(input.value).toBe("A"));
    expect(updateLeagueMock).not.toHaveBeenCalled();

    fireEvent.change(paste, { target: { value: "C\nD" } });
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを取り込み" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(paste.value).toBe("C\nD");
    expect(updateLeagueMock).not.toHaveBeenCalled();
  });

  it("確認すると参加単位の変更と構造リセットを反映し、方式と勝点設定を保持する", () => {
    const league = makeLeague();
    render(<LeagueParticipantsPage />);
    const input = screen.getByRole("textbox", { name: "1 選手名" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A（更新）" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "リセットして反映" }));

    expect(updateLeagueMock).toHaveBeenCalledTimes(1);
    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      participants: expect.arrayContaining([expect.objectContaining({ id: "p1", displayName: "A（更新）" })]),
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
      status: "draft",
      matchPolicy: league.matchPolicy,
      scoringPolicy: league.scoringPolicy,
    }));
  });

  it("グループ・対戦カード設定がない場合は確認せずに反映する", async () => {
    const league = makeLeague({ groups: [], matches: [], standings: [], matchSelectionStatus: "pending" });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);
    await waitFor(() => expect(updateLeagueMock).toHaveBeenCalledTimes(1));
    updateLeagueMock.mockClear();
    const input = screen.getByRole("textbox", { name: "1 選手名" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A（更新）" } });
    fireEvent.blur(input);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateLeagueMock).toHaveBeenCalledTimes(1);
  });

  it("トーナメント名簿画面に合わせた操作項目と詳細列開閉を表示する", () => {
    render(<LeagueParticipantsPage />);

    expect(screen.getByRole("button", { name: "行追加" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "自動選出" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "空行削除" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "入力チェック" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "参加者一覧" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "TSV/CSV貼り付け" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "貼り付けを取り込み" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "一覧" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "詳細列を開く" })).toBeTruthy();

    const summary = document.querySelector('[aria-label="参加者入力概要"]') as HTMLElement;
    expect(Array.from(summary.querySelectorAll("dt"), (node) => node.textContent)).toEqual(["参加者数", "選択済み", "定員"]);
    expect(screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }).getAttribute("placeholder")).toBe(
      "選手A\t所属A\t地区A\t備考A\n選手B\t所属B\t地区B\t備考B\n選手C\t所属C\t地区C\t備考C",
    );
    expect(screen.getByText(/シングルは「選手名・所属・地区・備考」/)).toBeTruthy();
    expect(document.querySelector(".league-participant-table")?.closest(".section-card")).toBeNull();

    const panel = document.querySelector(".league-participant-table")?.closest(".roster-panel");
    expect(panel?.classList.contains("roster-details-collapsed")).toBe(true);
    expect(document.querySelectorAll(".league-participant-table tbody td.roster-detail-column")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "詳細列を開く" }));
    expect(screen.getByRole("button", { name: "詳細列を閉じる" })).toBeTruthy();
    expect(panel?.classList.contains("roster-details-open")).toBe(true);
  });

  it("ダブルスの参加者一覧に列幅調整用のクラスを付ける", () => {
    useLeagueMock.mockReturnValue(makeLeague({ participantType: "doubles" }));
    render(<LeagueParticipantsPage />);

    expect(document.querySelector("th.league-participant-name-column")?.textContent).toBe("ペア名");
    expect(document.querySelectorAll("th.league-participant-member-column")).toHaveLength(2);
    expect(document.querySelectorAll("td.league-participant-member-column")).toHaveLength(4);
    expect(document.querySelector("th.league-participant-team-column")).toBeTruthy();
  });

  it("名簿一覧の最左チェックで選出者と補欠を切り替える", () => {
    const league = makeLeague({
      capacity: 2,
      participants: [
        { id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], team: "", region: "", note: "", selectionStatus: "selected" as const },
        { id: "p2", displayName: "B", participantType: "individual" as const, memberNames: ["B"], team: "", region: "", note: "", selectionStatus: "reserve" as const },
      ],
      selection: { ...createDefaultLeague().selection, mode: "manual" as const, selectedParticipantIds: ["p1"], reserveParticipantIds: ["p2"] },
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);

    const headers = Array.from(document.querySelectorAll(".league-participant-table thead th"), (node) => node.textContent);
    expect(headers[0]).toBe("選出");
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(document.querySelector("tr.league-participant-reserve-row")).toBeTruthy();

    fireEvent.click(checkboxes[1]);

    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({ mode: "manual", selectedParticipantIds: ["p1", "p2"] }),
      participants: expect.arrayContaining([expect.objectContaining({ id: "p2", selectionStatus: "selected" })]),
    }));
  });

  it("自動選出は現在のチェック状態をリセットして定員分を選出する", () => {
    const league = makeLeague({
      capacity: 1,
      participants: [
        { id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], team: "", region: "", note: "", selectionStatus: "selected" as const },
        { id: "p2", displayName: "B", participantType: "individual" as const, memberNames: ["B"], team: "", region: "", note: "", selectionStatus: "reserve" as const },
      ],
      selection: { ...createDefaultLeague().selection, mode: "manual" as const, selectedParticipantIds: ["p1"], reserveParticipantIds: ["p2"] },
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);

    fireEvent.click(screen.getByRole("button", { name: "自動選出" }));

    const savedLeague = updateLeagueMock.mock.calls[0]?.[0];
    expect(savedLeague.selection.mode).toBe("random");
    expect(savedLeague.selection.randomSeed).toEqual(expect.any(String));
    expect(savedLeague.selection.selectedParticipantIds).toHaveLength(1);
    expect(savedLeague.selection.reserveParticipantIds).toHaveLength(1);
    expect(savedLeague.selection.selectedParticipantIds[0]).toMatch(/p1|p2/);
  });

  it("自動選出は定員未満の場合に入力済み参加者を全員選出する", async () => {
    const league = makeLeague({
      capacity: 8,
      participants: [
        { id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], team: "", region: "", note: "", selectionStatus: "reserve" as const },
        { id: "p2", displayName: "B", participantType: "individual" as const, memberNames: ["B"], team: "", region: "", note: "", selectionStatus: "selected" as const },
      ],
      selection: { ...createDefaultLeague().selection, mode: "manual" as const, selectedParticipantIds: ["p2"], reserveParticipantIds: ["p1"] },
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);
    await waitFor(() => expect(updateLeagueMock).toHaveBeenCalledTimes(1));
    updateLeagueMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "自動選出" }));

    const savedLeague = updateLeagueMock.mock.calls[0]?.[0];
    expect(savedLeague.selection.selectedParticipantIds).toHaveLength(2);
    expect(savedLeague.selection.reserveParticipantIds).toHaveLength(0);
  });

  it("グループ・対戦カードがある状態の選出変更は確認後に反映する", () => {
    render(<LeagueParticipantsPage />);
    const checkbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;

    fireEvent.click(checkbox);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(updateLeagueMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "リセットして反映" }));

    expect(updateLeagueMock).toHaveBeenCalledWith(expect.objectContaining({
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    }));
  });

  it("結果入力後は選出チェックと自動選出を操作できない", () => {
    const league = makeLeague({
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "participantAWin" as const }],
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);

    expect((screen.getByRole("button", { name: "自動選出" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("checkbox").every((input) => (input as HTMLInputElement).disabled)).toBe(true);
  });

  it("名簿入力の次へは選出画面を経由せずグループ設定へ進む", () => {
    const league = makeLeague({ groups: [], matches: [], standings: [], matchSelectionStatus: "pending" });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/groups");
  });

  it("入力チェックを押すまでは参加者エラーを表示しない", () => {
    const league = makeLeague({
      participants: [{ id: "p1", displayName: "", participantType: "individual" as const, memberNames: [], team: "", region: "", note: "", selectionStatus: "selected" as const }],
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector('[aria-label="参加者入力概要"] .summary-alert')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "入力チェック" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector('[aria-label="参加者入力概要"] .summary-alert')).toBeTruthy();
  });

  it("貼り付けは入力済み参加者を保持して空行へ取り込む", async () => {
    const league = makeLeague({
      participants: [
        { id: "p1", displayName: "既存", participantType: "individual" as const, memberNames: ["既存"], team: "", region: "", note: "", selectionStatus: "selected" as const },
        { id: "p-empty", displayName: "", participantType: "individual" as const, memberNames: [], team: "", region: "", note: "", selectionStatus: "excluded" as const },
      ],
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
    });
    useLeagueMock.mockReturnValue(league);
    render(<LeagueParticipantsPage />);
    await waitFor(() => expect(updateLeagueMock).toHaveBeenCalledTimes(1));
    updateLeagueMock.mockClear();
    const paste = screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }) as HTMLTextAreaElement;

    fireEvent.change(paste, { target: { value: "追加" } });
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを取り込み" }));

    const savedLeague = updateLeagueMock.mock.calls[0]?.[0];
    expect(savedLeague.participants.map((participant: { displayName: string }) => participant.displayName)).toEqual(["既存", "追加"]);
    expect(savedLeague.participants[0].id).toBe("p1");
    expect(paste.value).toBe("");
  });
});

function makeLeague(overrides: Partial<ReturnType<typeof createDefaultLeague>> = {}) {
  const base = createDefaultLeague();
  return {
    ...base,
    id: "league-1",
    participants: [
      { id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], team: "", region: "", note: "", selectionStatus: "selected" as const },
      { id: "p2", displayName: "B", participantType: "individual" as const, memberNames: ["B"], team: "", region: "", note: "", selectionStatus: "selected" as const },
    ],
    selection: { ...base.selection, selectedParticipantIds: ["p1", "p2"] },
    groups: [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }],
    matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "unplayed" as const }],
    standings: [
      { groupId: "g1", participantId: "p1", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" as const },
      { groupId: "g1", participantId: "p2", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" as const },
    ],
    status: "scheduled" as const,
    matchSelectionStatus: "confirmed" as const,
    ...overrides,
  };
}
