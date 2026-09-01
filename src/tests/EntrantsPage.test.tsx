// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTournamentIntegrationMock, updateTournamentMock, useTournamentMock } = vi.hoisted(() => ({
  getTournamentIntegrationMock: vi.fn(),
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
    getTournamentIntegration: getTournamentIntegrationMock,
    updateTournamentWithIntegration: vi.fn(),
    updateTournamentIntegration: vi.fn(),
  }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => vi.fn(),
}));

import { createDefaultTournament, createEmptyEntrants } from "../app/tournamentModel";
import { EntrantsPage } from "../pages/EntrantsPage";

afterEach(cleanup);

beforeEach(() => {
  getTournamentIntegrationMock.mockReset();
  updateTournamentMock.mockReset();
  useTournamentMock.mockReset();
  getTournamentIntegrationMock.mockReturnValue(undefined);
  useTournamentMock.mockReturnValue({
    ...createDefaultTournament(),
    id: "tournament-1",
    matchType: "team",
    drawSize: 4,
    entrants: createEmptyEntrants(4, "team"),
  });
});

describe("EntrantsPage team mode", () => {
  it("shows team name, slash-separated members, and affiliation columns", () => {
    render(<EntrantsPage />);

    const headers = Array.from(document.querySelectorAll(".roster-table thead th"), (node) => node.textContent);
    expect(headers).toEqual(["No.", "シード", "チーム名*", "メンバー（/区切り）", "所属チーム⊕", "地区", "ランキング", "操作"]);
    expect(screen.getByRole("textbox", { name: "1 チーム名" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "1 メンバー" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }).getAttribute("placeholder")).toBe(
      "No, シード, チーム名, メンバー（/区切り）, 所属チーム, 地区, ランキング",
    );
  });

  it("updates team name and member names without changing the affiliation field", () => {
    const { rerender } = render(<EntrantsPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "1 チーム名" }), { target: { value: "Team A" } });
    const teamNameUpdate = updateTournamentMock.mock.calls[0]?.[0];
    expect(teamNameUpdate.entrants[0]).toMatchObject({ teamName: "Team A", team1: "" });

    useTournamentMock.mockReturnValue(teamNameUpdate);
    rerender(<EntrantsPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "1 メンバー" }), { target: { value: "Member A/Member B" } });

    const savedTournament = updateTournamentMock.mock.calls.at(-1)?.[0];
    expect(savedTournament.entrants[0]).toMatchObject({
      teamName: "Team A",
      memberNames: ["Member A", "Member B"],
      team1: "",
    });
  });
});

describe("EntrantsPage league-linked mode", () => {
  it("意図: リーググループとリーグ順位をリーグ結果の下にまとめ、入力列を短い見出しで表示する", () => {
    const tournament = {
      ...createDefaultTournament(),
      id: "tournament-1",
      matchType: "singles" as const,
      drawSize: 4 as const,
      entrants: createEmptyEntrants(4, "singles"),
    };
    getTournamentIntegrationMock.mockReturnValue({
      tournamentId: tournament.id,
      kind: "league-to-tournament",
      schemaVersion: 1,
      source: { leagueId: "league-1", leagueUpdatedAt: "2026-09-01T00:00:00.000Z", matchSelectionStatus: "confirmed" },
      sourceParticipantType: "individual",
      sourceGroupCount: 2,
      rankRange: { min: 1, max: 2 },
      participants: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    useTournamentMock.mockReturnValue(tournament);

    render(<EntrantsPage />);

    const headerRows = Array.from(document.querySelectorAll(".roster-table thead tr"), (row) =>
      Array.from(row.querySelectorAll("th"), (cell) => cell.textContent),
    );
    expect(headerRows).toEqual([["No.", "シード", "リーグ結果", "選手名*", "所属チーム⊕", "地区", "ランキング", "操作"]]);
    expect(document.querySelector(".league-result-heading")?.getAttribute("colspan")).toBe("2");
    expect(document.querySelector("tbody .league-group-column")).not.toBeNull();
    expect(document.querySelector("tbody .league-rank-column")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }).getAttribute("placeholder")).toBe(
      "No, シード, リーググループ, リーグ順位, 選手名, 所属チーム, 地区, ランキング",
    );
  });

  it("意図: ダブルスの選手名1・2に折り返さない幅を確保し、所属チーム列を個別に調整できるクラスを付ける", () => {
    const tournament = {
      ...createDefaultTournament(),
      id: "tournament-1",
      matchType: "doubles" as const,
      drawSize: 4 as const,
      entrants: createEmptyEntrants(4, "doubles"),
    };
    getTournamentIntegrationMock.mockReturnValue({
      tournamentId: tournament.id,
      kind: "league-to-tournament",
      schemaVersion: 1,
      source: { leagueId: "league-1", leagueUpdatedAt: "2026-09-01T00:00:00.000Z", matchSelectionStatus: "confirmed" },
      sourceParticipantType: "doubles",
      sourceGroupCount: 2,
      rankRange: { min: 1, max: 2 },
      participants: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    useTournamentMock.mockReturnValue(tournament);

    render(<EntrantsPage />);

    expect(document.querySelectorAll("thead .roster-doubles-player-column")).toHaveLength(2);
    expect(document.querySelectorAll("thead .roster-doubles-team-column")).toHaveLength(2);
    expect(document.querySelectorAll("tbody .roster-doubles-player-column")).toHaveLength(8);
    expect(document.querySelectorAll("tbody .roster-doubles-team-column")).toHaveLength(8);
    expect(document.querySelector("thead .roster-region-column")).not.toBeNull();
    expect(document.querySelector("tbody .roster-region-column")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "TSV/CSV貼り付け" }).getAttribute("placeholder")).toBe(
      "No, シード, リーググループ, リーグ順位, 選手名1, 選手名2, 所属チーム1, 所属チーム2, 同チーム扱い, 地区, ランキング",
    );
  });
});
