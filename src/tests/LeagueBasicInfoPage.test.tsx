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
    storageStatus: "saving",
    storageError: undefined,
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { createDefaultLeague } from "../app/leagueModel";
import { LeagueBasicInfoPage } from "../pages/LeagueBasicInfoPage";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateLeagueMock.mockReset();
  useLeagueMock.mockReset();
  useLeagueMock.mockReturnValue({ ...createDefaultLeague(), id: "league-1" });
});

describe("LeagueBasicInfoPage", () => {
  it("初期表示では必須エラーと保存中表示を出さない", () => {
    render(<LeagueBasicInfoPage />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("IndexedDBへ自動保存しています。")).toBeNull();
    expect((screen.getByRole("button", { name: "次へ" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "一覧" }).getAttribute("title")).toBe("リーグ一覧へ戻る");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("title")).toBe("名簿入力・選出へ進む");
    expect(screen.getByRole("textbox", { name: "大会名" }).closest("label")?.querySelector(".required-marker")).toBeNull();
  });

  it("種目区分はシングル・ダブルス・チームから選択できる", () => {
    render(<LeagueBasicInfoPage />);

    expect(screen.getByText("種目区分")).toBeTruthy();
    const options = Array.from(screen.getByRole("combobox").querySelectorAll("option"), (option) => option.textContent);
    expect(options).toEqual(["シングル", "ダブルス", "チーム"]);
  });

  it("大会名が未入力でもフォーカス離脱だけではエラーを出さない", () => {
    render(<LeagueBasicInfoPage />);
    const titleInput = screen.getByRole("textbox", { name: /大会名/ });

    fireEvent.blur(titleInput);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("大会名が未入力でも次へ操作で参加単位画面へ遷移する", () => {
    render(<LeagueBasicInfoPage />);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/leagues/league-1/edit/participants");
  });

  it("対戦カード確定後は種別区分と定員を変更できない", () => {
    useLeagueMock.mockReturnValue({
      ...createDefaultLeague(),
      id: "league-1",
      matchSelectionStatus: "confirmed",
      status: "scheduled",
    });

    render(<LeagueBasicInfoPage />);

    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("spinbutton", { name: /定員/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toBe("対戦カード確定後のため、種目区分と定員は変更できません。");
  });

  it("未確定なら結果入力済みでも種別区分と定員を変更できる", () => {
    useLeagueMock.mockReturnValue({
      ...createDefaultLeague(),
      id: "league-1",
      matchSelectionStatus: "pending",
      status: "inProgress",
    });

    render(<LeagueBasicInfoPage />);

    expect(screen.getByRole("combobox")).toHaveProperty("disabled", false);
    expect(screen.getByRole("spinbutton", { name: /定員/ })).toHaveProperty("disabled", false);
  });
});
