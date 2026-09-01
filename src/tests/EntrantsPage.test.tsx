// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateTournamentMock, useTournamentMock } = vi.hoisted(() => ({
  updateTournamentMock: vi.fn(),
  useTournamentMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "tournament-1" }),
}));

vi.mock("../app/TournamentProvider", () => ({
  useTournament: useTournamentMock,
  useTournaments: () => ({ updateTournament: updateTournamentMock }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => vi.fn(),
}));

import { createDefaultTournament, createEmptyEntrants } from "../app/tournamentModel";
import { EntrantsPage } from "../pages/EntrantsPage";

afterEach(cleanup);

beforeEach(() => {
  updateTournamentMock.mockReset();
  useTournamentMock.mockReset();
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
