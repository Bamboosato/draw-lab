// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import { LeagueTournamentCreateDialog } from "../components/LeagueTournamentCreateDialog";
import type { League } from "../domain/leagueTypes";

afterEach(cleanup);

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    ...createDefaultLeague(),
    id: "league-source",
    title: "春季リーグ",
    capacity: 4,
    groups: [
      { id: "group-a", name: "A組", participantIds: ["p1", "p2", "p4"] },
      { id: "group-b", name: "B組", participantIds: ["p3", "p5", "p6"] },
    ],
    selection: {
      mode: "manual",
      selectedParticipantIds: ["p1", "p2", "p3"],
      reserveParticipantIds: [],
    },
    status: "scheduled",
    matchSelectionStatus: "confirmed",
    ...overrides,
  };
}

describe("LeagueTournamentCreateDialog", () => {
  it("意図: 引継ぎ元リーグの4項目をコンパクトサマリーで表示する", () => {
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague()]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText("対戦カード確定済みのリーグがありません。")).toBeNull();
    const summary = document.querySelector(".league-create-dialog .compact-summary");
    expect(summary).not.toBeNull();
    expect(summary?.querySelectorAll(".summary-metric")).toHaveLength(4);
    expect(Array.from(summary?.querySelectorAll("dd") ?? [], (element) => element.textContent)).toEqual(["", "", "", ""]);
    expect(document.querySelector(".league-create-feedback-hint")?.textContent).toBe("\u00a0");

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });

    expect(screen.getByText("リーグの状態")).toBeTruthy();
    expect(screen.getByText("対戦前")).toBeTruthy();
    expect(screen.getByText("4名")).toBeTruthy();
    expect(Array.from(summary?.querySelectorAll("dd") ?? [], (element) => element.textContent)).toContain("2");
    expect(screen.getByText("選択済み参加者数")).toBeTruthy();
    expect(screen.getByText("3名")).toBeTruthy();
    expect(screen.getByText("作成時のドローサイズ: 4")).toBeTruthy();
  });

  it("意図: 選択したリーグと順位区分を確定して作成処理へ渡す", () => {
    const onConfirm = vi.fn();
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague()]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });
    const rankSelects = screen.getAllByRole("combobox").slice(1);
    fireEvent.change(rankSelects[0], { target: { value: "2" } });
    fireEvent.change(rankSelects[1], { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "基本情報へ進む" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "league-source" }), { min: 2, max: 3 });
  });

  it("意図: 最小グループ人数を超える終了順位では作成できない", () => {
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague()]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });
    const rankSelects = screen.getAllByRole("combobox").slice(1);

    expect(Array.from((rankSelects[1] as HTMLSelectElement).options, (option) => option.value)).toEqual(["1", "2", "3"]);
    expect(Array.from((rankSelects[1] as HTMLSelectElement).options, (option) => option.value)).not.toContain("4");
    expect((screen.getByRole("button", { name: "基本情報へ進む" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("意図: 開始順位が終了順位を超える場合は前後関係に合ったエラーを表示する", () => {
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague()]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });
    const rankSelects = screen.getAllByRole("combobox").slice(1);
    fireEvent.change(rankSelects[0], { target: { value: "3" } });

    expect((rankSelects[1] as HTMLSelectElement).value).toBe("3");
    expect(screen.getByRole("alert").textContent).toContain("グループ数×順位数（2）");
    expect(screen.getByRole("alert").textContent).not.toContain("終了順位は開始順位");
  });

  it("意図: 対応外のドローサイズを予約行内のエラー表示へ置き換える", () => {
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague()]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "league-source" } });
    const rankSelects = screen.getAllByRole("combobox").slice(1);
    fireEvent.change(rankSelects[1], { target: { value: "3" } });

    expect(screen.getByRole("alert").textContent).toContain("グループ数×順位数（6）");
    expect(document.querySelectorAll(".league-create-feedback-hint")).toHaveLength(1);
  });

  it("意図: 対戦カード確定済みのリーグがなければ作成を実行できない", () => {
    render(
      <LeagueTournamentCreateDialog
        open
        leagues={[makeLeague({ matchSelectionStatus: "pending" })]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("対戦カード確定済みのリーグがありません。")).toBeTruthy();
    expect((screen.getByRole("button", { name: "基本情報へ進む" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
