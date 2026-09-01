// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import { createLeagueToTournament } from "../app/leagueTournamentAdapter";

const {
  getTournamentIntegrationMock,
  navigateMock,
  updateTournamentMock,
  updateTournamentWithIntegrationMock,
  useLeaguesMock,
  useTournamentMock,
} = vi.hoisted(() => ({
  getTournamentIntegrationMock: vi.fn(),
  navigateMock: vi.fn(),
  updateTournamentMock: vi.fn(),
  updateTournamentWithIntegrationMock: vi.fn(),
  useLeaguesMock: vi.fn(),
  useTournamentMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "tournament-1" }),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("../app/TournamentProvider", () => ({
  useTournament: useTournamentMock,
  useTournaments: () => ({
    updateTournament: updateTournamentMock,
    getTournamentIntegration: getTournamentIntegrationMock,
    updateTournamentWithIntegration: updateTournamentWithIntegrationMock,
  }),
}));

vi.mock("../app/LeagueProvider", () => ({
  useLeagues: useLeaguesMock,
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { BasicInfoPage } from "../pages/BasicInfoPage";
import { makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateTournamentMock.mockReset();
  updateTournamentWithIntegrationMock.mockReset();
  getTournamentIntegrationMock.mockReset();
  useLeaguesMock.mockReset();
  useTournamentMock.mockReset();
  getTournamentIntegrationMock.mockReturnValue(undefined);
  useLeaguesMock.mockReturnValue({ leagues: [] });
  useTournamentMock.mockReturnValue(makeTournament());
});

describe("BasicInfoPage", () => {
  it("種目区分にチームを表示する", () => {
    const { container } = render(<BasicInfoPage />);

    expect(Array.from(container.querySelectorAll("select option"), (option) => option.textContent)).toContain("チーム");
  });

  it("意図: リーグ表から作成の入力順と4項目サマリーをダイアログと同じ構成で表示する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    getTournamentIntegrationMock.mockReturnValue(linked.integration);
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(linked.tournament);

    const { container } = render(<BasicInfoPage />);
    const panel = container.querySelector<HTMLElement>(".league-source-panel");

    expect(panel?.querySelector("select")?.value).toBe(sourceLeague.id);
    expect(panel?.querySelector("h2")).toBeNull();
    expect(panel?.textContent).toContain("引継ぎ元のリーグ表と、このトーナメントで扱う順位区分を指定してください。");
    expect(panel?.querySelector(".compact-summary")).not.toBeNull();
    expect(panel?.querySelectorAll(".summary-metric")).toHaveLength(4);
    expect(panel?.querySelector(".summary-list")).toBeNull();
    expect(panel?.querySelector(".league-create-rank-fields")).not.toBeNull();
    expect(panel?.textContent).toContain("選択済み参加者数");
  });

  it("仕様上の必須項目だけに名簿入力と同じ必須印を表示する", () => {
    const { container } = render(<BasicInfoPage />);
    const fields = Array.from(container.querySelectorAll<HTMLLabelElement>("label.field"));

    expectRequiredMarker(fields, "種目区分");
    expectRequiredMarker(fields, "ドローサイズ");
    expectRequiredMarker(fields, "シード数");

    for (const optionalLabel of ["大会名", "開催日", "会場", "種目名"]) {
      expect(getField(fields, optionalLabel).querySelector(".required-marker")).toBeNull();
    }
  });

  it("意図: 引継ぎ元の変更では大会名とドローサイズを自動更新せず、連携先だけを差し替える", () => {
    const originalLeague = makeLeague("league-original", "元リーグ");
    const replacementLeague = {
      ...makeLeague("league-replacement", "変更先リーグ"),
      groups: [
        { id: "replacement-group-a", name: "A組", participantIds: ["league-replacement-p1"] },
        { id: "replacement-group-b", name: "B組", participantIds: ["league-replacement-p2"] },
      ],
    };
    const linked = createLeagueToTournament(makeTournament(), originalLeague, { min: 1, max: 2 });
    const manuallyEditedTournament = {
      ...linked.tournament,
      title: "手動編集済み大会",
      drawSize: 8 as const,
      options: { ...linked.tournament.options, randomSeed: "保持するシード" },
    };
    getTournamentIntegrationMock.mockReturnValue(linked.integration);
    useLeaguesMock.mockReturnValue({ leagues: [originalLeague, replacementLeague] });
    useTournamentMock.mockReturnValue(manuallyEditedTournament);

    const { container } = render(<BasicInfoPage />);
    const sourceField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "引継ぎ元のリーグ表");
    fireEvent.change(sourceField.querySelector("select")!, { target: { value: replacementLeague.id } });

    expect(updateTournamentWithIntegrationMock).toHaveBeenCalledTimes(1);
    const [nextTournament, nextIntegration] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament).toMatchObject({
      title: manuallyEditedTournament.title,
      date: linked.tournament.date,
      venue: linked.tournament.venue,
      eventName: linked.tournament.eventName,
      drawSize: manuallyEditedTournament.drawSize,
      options: manuallyEditedTournament.options,
    });
    expect(nextIntegration).toMatchObject({
      source: { leagueId: replacementLeague.id },
    });
  });

  it("意図: 順位区分の変更時、直前の自動生成値であるドローサイズだけを新しい値へ更新する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    getTournamentIntegrationMock.mockReturnValue(linked.integration);
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(linked.tournament);

    const { container } = render(<BasicInfoPage />);
    const rankEndField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "順位区分（終了）");
    fireEvent.change(rankEndField.querySelector("input")!, { target: { value: "1" } });

    expect(updateTournamentWithIntegrationMock).toHaveBeenCalledTimes(1);
    const [nextTournament, nextIntegration] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament).toMatchObject({
      title: "元リーグ（1-1位）",
      drawSize: 4,
    });
    expect(nextIntegration).toMatchObject({
      source: { leagueId: sourceLeague.id },
      rankRange: { min: 1, max: 1 },
    });
  });

  it("意図: 終了順位が最小グループ人数を超える場合は保存せず、入力上限も表示する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    getTournamentIntegrationMock.mockReturnValue(linked.integration);
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(linked.tournament);

    const { container } = render(<BasicInfoPage />);
    const rankEndField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "順位区分（終了）");
    const rankEndInput = rankEndField.querySelector<HTMLInputElement>("input")!;

    expect(rankEndInput.max).toBe("4");
    fireEvent.change(rankEndInput, { target: { value: "5" } });

    expect(updateTournamentWithIntegrationMock).not.toHaveBeenCalled();
    expect(container.querySelector(".validation-banner")?.textContent).toContain("終了順位をグループ内の人数（4位）以下");
  });

  it("意図: ドローサイズを手動変更済みの場合、順位区分の変更でもその値を保持する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    const manuallySizedTournament = { ...linked.tournament, drawSize: 16 as const };
    getTournamentIntegrationMock.mockReturnValue({ ...linked.integration, drawSizeMode: "manual" });
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(manuallySizedTournament);

    const { container } = render(<BasicInfoPage />);
    const rankEndField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "順位区分（終了）");
    fireEvent.change(rankEndField.querySelector("input")!, { target: { value: "1" } });

    expect(updateTournamentWithIntegrationMock).toHaveBeenCalledTimes(1);
    const [nextTournament] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament).toMatchObject({
      title: "元リーグ（1-1位）",
      drawSize: 16,
    });
  });

  it("意図: 画面上のリーグのグループ数を基準に順位区分変更後のドローサイズを再計算する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    getTournamentIntegrationMock.mockReturnValue({ ...linked.integration, sourceGroupCount: 2 });
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(linked.tournament);

    const { container } = render(<BasicInfoPage />);
    const rankEndField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "順位区分（終了）");
    fireEvent.change(rankEndField.querySelector("input")!, { target: { value: "4" } });

    const [nextTournament] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament.drawSize).toBe(16);
  });

  it("意図: 自動生成時の連携情報がない既存データでも、自動生成された大会名なら不整合なドローサイズを修復する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 4 });
    const legacyIntegration = { ...linked.integration, drawSizeMode: undefined };
    const legacyTournament = {
      ...linked.tournament,
      title: "元リーグ（1-4位）",
      drawSize: 8 as const,
    };
    getTournamentIntegrationMock.mockReturnValue(legacyIntegration);
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(legacyTournament);

    render(<BasicInfoPage />);

    const [nextTournament, nextIntegration] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament.drawSize).toBe(16);
    expect(nextIntegration.drawSizeMode).toBe("auto");
  });

  it("意図: 順位入力欄を空にする中間状態を保存せず、再入力後に自動ドローサイズを更新する", () => {
    const sourceLeague = makeLeagueWithGroups("league-source", "元リーグ", 4);
    const linked = createLeagueToTournament(makeTournament(), sourceLeague, { min: 1, max: 2 });
    getTournamentIntegrationMock.mockReturnValue(linked.integration);
    useLeaguesMock.mockReturnValue({ leagues: [sourceLeague] });
    useTournamentMock.mockReturnValue(linked.tournament);

    const { container } = render(<BasicInfoPage />);
    const rankEndField = getField(Array.from(container.querySelectorAll<HTMLLabelElement>("label.field")), "順位区分（終了）");
    const rankEndInput = rankEndField.querySelector("input")!;
    fireEvent.change(rankEndInput, { target: { value: "" } });
    expect(updateTournamentWithIntegrationMock).not.toHaveBeenCalled();

    fireEvent.change(rankEndInput, { target: { value: "4" } });

    expect(updateTournamentWithIntegrationMock).toHaveBeenCalledTimes(1);
    const [nextTournament, nextIntegration] = updateTournamentWithIntegrationMock.mock.calls[0];
    expect(nextTournament.drawSize).toBe(16);
    expect(nextIntegration.rankRange).toEqual({ min: 1, max: 4 });
  });
});

function makeLeague(id: string, title: string) {
  return {
    ...createDefaultLeague(),
    id,
    title,
    participantType: "individual" as const,
    capacity: 4,
    participants: [
      { id: `${id}-p1`, displayName: "選手1", participantType: "individual" as const, memberNames: [], team: "所属A", region: "東", selectionStatus: "selected" as const },
      { id: `${id}-p2`, displayName: "選手2", participantType: "individual" as const, memberNames: [], team: "所属B", region: "西", selectionStatus: "selected" as const },
    ],
    selection: { mode: "all" as const, selectedParticipantIds: [`${id}-p1`, `${id}-p2`], reserveParticipantIds: [] },
    groups: [{ id: `${id}-group`, name: "A組", participantIds: [`${id}-p1`, `${id}-p2`] }],
    matchSelectionStatus: "confirmed" as const,
    status: "scheduled" as const,
  };
}

function makeLeagueWithGroups(id: string, title: string, groupCount: number) {
  const league = makeLeague(id, title);
  return {
    ...league,
    groups: Array.from({ length: groupCount }, (_, index) => ({
      id: `${id}-group-${index + 1}`,
      name: `${String.fromCharCode(65 + index)}組`,
      participantIds: Array.from({ length: 4 }, (_, memberIndex) => `${id}-group-${index + 1}-p${memberIndex + 1}`),
    })),
  };
}

function expectRequiredMarker(fields: HTMLLabelElement[], label: string): void {
  const marker = getField(fields, label).querySelector<HTMLElement>(".required-marker");

  expect(marker?.textContent).toBe("*");
  expect(marker?.getAttribute("aria-label")).toBe("必須");
}

function getField(fields: HTMLLabelElement[], label: string): HTMLLabelElement {
  const field = fields.find((candidate) => candidate.textContent?.startsWith(label));

  if (!field) {
    throw new Error(`${label}の入力欄が見つかりません。`);
  }

  return field;
}
