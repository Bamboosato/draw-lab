// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, updateTournamentMock, useTournamentMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  updateTournamentMock: vi.fn(),
  useTournamentMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "tournament-1" }),
}));

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
  it("初期表示は1回戦の全カードで、引き分けボタンを無効表示する", () => {
    render(<TournamentMatchesPage />);

    expect(screen.getByText("ラウンドごとの対戦カードに対戦結果を入力します。結果は次のラウンドに自動で反映されます。")).toBeTruthy();
    expect(screen.getByText("結果入力はこの一覧から行います。")).toBeTruthy();
    expect(screen.getByText("ラウンド")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
    const regenerateButton = screen.getByRole("button", { name: "1回戦の組合せを再生成" });
    expect((regenerateButton as HTMLButtonElement).disabled).toBe(false);
    expect(regenerateButton.getAttribute("title")).toBe("1回戦の組合せを再生成");
    expect(screen.getAllByText("第1試合").every((label) => label.className.includes("match-order-label"))).toBe(true);
    expect(screen.getByRole("tab", { name: "決勝" })).toBeTruthy();
    expect(document.querySelectorAll(".tournament-match-card")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "引き分け" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "引き分け" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole("button", { name: /の勝ち$/ })).toHaveLength(4);
    expect(screen.getAllByRole("textbox", { name: "備考" }).every((input) => input.getAttribute("placeholder") === "結果の詳細を記録してください（任意）")).toBe(true);
  });

  it("2回戦は未確定の枠を表示し、結果入力を無効にする", () => {
    render(<TournamentMatchesPage />);

    fireEvent.click(screen.getByRole("tab", { name: "決勝" }));

    expect(screen.getByRole("heading", { name: "対戦カード" })).toBeTruthy();
    expect(screen.getAllByText("未確定").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /の勝ち$/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole("textbox", { name: "備考" }).every((input) => (input as HTMLInputElement).disabled)).toBe(true);
  });

  it("結果入力済みカードは実施済の青色バッジを表示する", () => {
    const tournament = makeTournamentWithDraw();
    tournament.generatedDraw.matches = tournament.generatedDraw.matches.map((match) => match.id === "match-1" ? { ...match, result: "participantAWin" as const } : match);
    useTournamentMock.mockReturnValue(tournament);

    render(<TournamentMatchesPage />);

    const status = screen.getByText("実施済");
    expect(status.className).toContain("status-badge league-match-status-confirmed");
    expect(screen.queryByText("結果入力済み")).toBeNull();
  });

  it("結果または備考が入力済みの場合は1回戦の組合せ再生成を無効にする", () => {
    const tournament = makeTournamentWithDraw();
    tournament.generatedDraw.matches = tournament.generatedDraw.matches.map((match) => match.id === "match-1"
      ? { ...match, result: "participantAWin" as const }
      : match.id === "match-2"
        ? { ...match, note: "試合メモ" }
        : match);
    useTournamentMock.mockReturnValue(tournament);

    render(<TournamentMatchesPage />);

    const button = screen.getByRole("button", { name: "1回戦の組合せを再生成" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("結果または備考入力済みのため、1回戦の組合せを再生成できません。");
    expect(button.parentElement?.getAttribute("title")).toBe("結果または備考入力済みのため、1回戦の組合せを再生成できません。");
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

  it("1回戦の勝敗を保存し、カード更新後のドローだけを更新する", () => {
    const tournament = makeTournamentWithDraw();
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
});

function makeTournamentWithDraw() {
  const tournament = makeTournament({ drawSize: 4, entrants: makeEntrants(4) });
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
      matches: createTournamentMatches(slots, 4),
      generatedAt: "2026-09-03T00:00:00.000Z",
    },
  };
}
