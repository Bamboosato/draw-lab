// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { importLeagueMock, navigateMock, replaceAllLeaguesMock, useLeaguesMock } = vi.hoisted(() => ({
  importLeagueMock: vi.fn(),
  navigateMock: vi.fn(),
  replaceAllLeaguesMock: vi.fn(),
  useLeaguesMock: vi.fn(),
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeagues: useLeaguesMock,
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import { LeagueJsonImportPage } from "../pages/LeagueJsonImportPage";
import { serializeAllLeagues, serializeLeague } from "../storage/leagueJson";

afterEach(cleanup);

beforeEach(() => {
  importLeagueMock.mockReset();
  navigateMock.mockReset();
  replaceAllLeaguesMock.mockReset();
  replaceAllLeaguesMock.mockResolvedValue(undefined);
  useLeaguesMock.mockReturnValue({
    leagues: [{ ...createDefaultLeague(), id: "existing-league", title: "既存リーグ" }],
    importLeague: importLeagueMock,
    replaceAllLeagues: replaceAllLeaguesMock,
    storageStatus: "ready",
    storageError: undefined,
  });
});

describe("LeagueJsonImportPage", () => {
  it("個別リーグを既存データへ上書きせず追加する", async () => {
    const source = { ...createDefaultLeague(), id: "imported-league", title: "取込リーグ" };
    const view = render(<LeagueJsonImportPage />);
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([serializeLeague(source)], "league.json", { type: "application/json" });

    expect(screen.getByRole("button", { name: "リーグ情報ファイルを選択" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "読込結果" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "JSON本文" })).toBeNull();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect((screen.getByRole("button", { name: "個別リーグを追加" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "個別リーグを追加" }));

    expect(importLeagueMock).toHaveBeenCalledTimes(1);
    expect(importLeagueMock.mock.calls[0]?.[0].id).not.toBe(source.id);
    expect(navigateMock).toHaveBeenCalledWith("/leagues");
  });

  it("全リーグバックアップは確認後に全置換する", async () => {
    const source = { ...createDefaultLeague(), id: "backup-league", title: "復元リーグ" };
    const view = render(<LeagueJsonImportPage />);
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([serializeAllLeagues([source])], "backup.json", { type: "application/json" });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect((screen.getByRole("button", { name: "全リーグを復元" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "全リーグを復元" }));

    expect(screen.getByRole("heading", { name: "現在の全リーグを置き換えます" })).toBeTruthy();
    expect(replaceAllLeaguesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "全置換する" }));
    await waitFor(() => expect(replaceAllLeaguesMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: source.id, title: source.title })]),
    ));
    expect(navigateMock).toHaveBeenCalledWith("/leagues");
  });
});
