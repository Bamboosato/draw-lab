// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("../utils/print", () => ({
  buildTournamentPrintFilename: () => "tournament.pdf",
  printWithFilename: vi.fn(),
}));

import { PreviewPage } from "../pages/PreviewPage";
import { makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateTournamentMock.mockReset();
  useTournamentMock.mockReturnValue(makeTournament());
});

describe("PreviewPage", () => {
  it("未生成の場合は完了操作を受け付けず、理由を表示する", () => {
    render(<PreviewPage />);

    fireEvent.click(screen.getByRole("button", { name: "トーナメントを完了" }));

    expect(updateTournamentMock).not.toHaveBeenCalled();
    expect(screen.getByText("トーナメント表を生成してから完了してください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "PDF/印刷" })).toBeTruthy();
  });

  it("完了済みでは読み取り専用表示と編集再開を提供する", () => {
    const tournament = makeTournament({ status: "completed" });
    useTournamentMock.mockReturnValue(tournament);

    render(<PreviewPage />);

    expect(screen.getByRole("button", { name: "編集を再開" })).toBeTruthy();
    expect(screen.getByText("このトーナメントは完了済みです。内容は読み取り専用です。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "編集を再開" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("トーナメントを編集中に戻します。結果、ゲーム数、備考、組合せは保持されます。")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "編集を再開" }));

    expect(updateTournamentMock).toHaveBeenCalledWith(expect.objectContaining({ status: "inProgress" }));
  });
});
