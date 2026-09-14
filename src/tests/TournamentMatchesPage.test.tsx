// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, updateTournamentMock, useTournamentMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  updateTournamentMock: vi.fn(),
  useTournamentMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "tournament-1" }) }));
vi.mock("../app/TournamentProvider", () => ({
  useTournament: useTournamentMock,
  useTournaments: () => ({
    updateTournament: updateTournamentMock,
    getTournamentIntegration: () => undefined,
  }),
}));
vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createTournamentMatches } from "../domain/tournamentMatches";
import { TournamentMatchesPage } from "../pages/TournamentMatchesPage";
import { makeEntrants, makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateTournamentMock.mockReset();
  useTournamentMock.mockReturnValue(makeTournamentWithDraw());
});

describe("TournamentMatchesPage", () => {
  it("未確定中は結果・備考・ゲーム数を入力できず、再生成はできる", () => {
    render(<TournamentMatchesPage />);

    expect(screen.getByText("ラウンドごとの対戦カードに対戦結果を入力します。結果は次のラウンドに自動で反映されます。")).toBeTruthy();
    const notice = screen.getByText("対戦カードの内容を確認し、「対戦カードを確定」を押してください。確定後に、勝敗・ゲーム数・備考を入力できます。");
    expect(notice.className).toContain("field-hint tournament-match-state-message");
    expect(notice.closest(".flow-notice")).toBeNull();
    expect(screen.getByText("未確定").className).toContain("status-badge league-match-status-pending");
    expect((screen.getByRole("checkbox", { name: "詳細入力" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: /の勝ち$/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole("textbox", { name: "備考" }).every((input) => (input as HTMLInputElement).disabled)).toBe(true);
    const regenerate = screen.getByRole("button", { name: "1回戦の組合せを再生成" });
    expect((regenerate as HTMLButtonElement).disabled).toBe(false);
    expect(regenerate.closest(".tournament-round-actions")).toBeTruthy();
    const confirmButton = screen.getByRole("button", { name: "対戦カードを確定" });
    expect(confirmButton.className).toContain("button primary");
    expect(confirmButton.closest(".tournament-round-actions")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "詳細入力" }).closest(".section-card-heading")).toBeTruthy();
  });

  it("旧形式のmatchesなしドローでも対戦カード画面を表示できる", () => {
    const tournament = makeTournamentWithDraw();
    delete (tournament.generatedDraw as { matches?: unknown }).matches;
    useTournamentMock.mockReturnValue(tournament);

    expect(() => render(<TournamentMatchesPage />)).not.toThrow();
    expect(screen.getByText("対戦カード")).toBeTruthy();
    expect(screen.getAllByText(/第1試合/).length).toBeGreaterThan(0);
  });

  it("確定すると対戦結果を入力できる", () => {
    const tournament = makeTournamentWithDraw();
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    fireEvent.click(screen.getByRole("button", { name: "対戦カードを確定" }));

    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({
      matchSelectionStatus: "confirmed",
    }));
  });

  it("結果入力済みカードは実施済みバッジを表示し、再生成を無効にする", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed" });
    tournament.generatedDraw!.matches = tournament.generatedDraw!.matches.map((match) => match.id === "match-1"
      ? { ...match, result: "participantAWin" as const }
      : match);
    useTournamentMock.mockReturnValue(tournament);

    render(<TournamentMatchesPage />);

    const notice = screen.getByText("各試合の勝敗・ゲーム数・備考を入力できます。ドロー構成や試合形式を変更する場合は、「確定解除」を押してください。");
    expect(notice.className).toContain("field-hint tournament-match-state-message");
    expect(notice.closest(".flow-notice")).toBeNull();
    expect(screen.getByText("確定").className).toContain("status-badge league-match-status-confirmed");
    const status = screen.getByText("実施済み");
    expect(status.className).toContain("status-badge league-match-status-confirmed");
    expect(screen.getByRole("button", { name: "確定解除" }).className).toContain("button primary");
    const regenerate = screen.getByRole("button", { name: "1回戦の組合せを再生成" });
    expect((regenerate as HTMLButtonElement).disabled).toBe(true);
    expect(regenerate.getAttribute("title")).toContain("確定後");
  });

  it("確定済みで結果・備考が入力済みの場合は再生成を無効にする", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed" });
    tournament.generatedDraw!.matches = tournament.generatedDraw!.matches.map((match) => match.id === "match-1"
      ? { ...match, result: "participantAWin" as const }
      : match.id === "match-2"
        ? { ...match, note: "試合メモ" }
        : match);
    useTournamentMock.mockReturnValue(tournament);

    render(<TournamentMatchesPage />);

    expect((screen.getByRole("button", { name: "1回戦の組合せを再生成" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("結果・備考が未入力なら再生成して対戦カード画面に留まる", () => {
    const tournament = makeTournamentWithDraw();
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    fireEvent.click(screen.getByRole("button", { name: "1回戦の組合せを再生成" }));

    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({
      id: tournament.id,
      generatedDraw: expect.objectContaining({
        randomSeed: expect.any(String),
        matches: expect.arrayContaining([expect.objectContaining({ result: "unplayed" })]),
      }),
    }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("確定済みの1回戦の勝敗を保存し、カード更新後のドローだけを更新する", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed" });
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /の勝ち$/ })[0]!);

    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({
      id: tournament.id,
      generatedDraw: expect.objectContaining({
        matches: expect.arrayContaining([expect.objectContaining({ id: "match-1", result: "participantAWin" })]),
      }),
    }));
  });

  it("詳細入力をONにすると、セットスコアを入力できる", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed" });
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: "詳細入力" }));
    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({ detailInputEnabled: true }));
  });

  it("1セットの両方のゲーム数が入力されると、未実施の勝者を自動選択する", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed", detailInputEnabled: true });
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    const scoreInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(scoreInputs[0]!, { target: { value: "6" } });

    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({
      generatedDraw: expect.objectContaining({
        matches: expect.arrayContaining([expect.objectContaining({
          id: "match-1",
          result: "unplayed",
          setScores: expect.arrayContaining([expect.objectContaining({ participantA: 6 })]),
        })]),
      }),
    }));

    expect(updateTournamentMock).toHaveBeenCalledTimes(1);
  });

  it("勝者を選択した後にWOを記録でき、ゲーム数は変更しない", () => {
    const tournament = makeTournamentWithDraw({ matchSelectionStatus: "confirmed", detailInputEnabled: true });
    tournament.generatedDraw!.matches = tournament.generatedDraw!.matches.map((match) => match.id === "match-1"
      ? { ...match, result: "participantAWin" as const, setScores: [{ participantA: 6, participantB: 1 }] }
      : match);
    useTournamentMock.mockReturnValue(tournament);
    render(<TournamentMatchesPage />);

    const walkover = screen.getByRole("checkbox", { name: "第1試合 Walk Over" });
    expect((walkover as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(walkover);

    expect(updateTournamentMock).toHaveBeenLastCalledWith(expect.objectContaining({
      generatedDraw: expect.objectContaining({
        matches: expect.arrayContaining([expect.objectContaining({
          id: "match-1",
          result: "participantAWin",
          isWalkover: true,
          setScores: [{ participantA: 6, participantB: 1 }],
        })]),
      }),
    }));
  });
});

function makeTournamentWithDraw(overrides: Parameters<typeof makeTournament>[0] = {}) {
  const tournament = makeTournament({ drawSize: 4, entrants: makeEntrants(4), ...overrides });
  const slots = tournament.entrants.map((entrant, index) => ({
    position: index + 1,
    entrantId: entrant.id,
    isBye: false,
  }));
  return {
    ...tournament,
    generatedDraw: {
      id: "draw-1",
      tournamentId: tournament.id,
      randomSeed: "seed-1",
      slots,
      matches: createTournamentMatches(slots, 4, undefined, tournament.matchFormat),
      generatedAt: "2026-09-03T00:00:00.000Z",
    },
  };
}
