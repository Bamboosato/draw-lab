import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOURNAMENT_SORT,
  getNextTournamentSort,
  sortTournaments,
  type TournamentSort,
} from "../app/tournamentListSort";
import type { Tournament } from "../domain/types";

describe("tournamentListSort", () => {
  it("初期条件では最終更新が新しい大会から並べる", () => {
    const tournaments = [
      createTournament("old", "2026-09-01", "2026-08-01T00:00:00.000Z"),
      createTournament("new", "2026-07-01", "2026-08-03T00:00:00.000Z"),
      createTournament("middle", "2026-08-01", "2026-08-02T00:00:00.000Z"),
    ];

    expect(sortTournaments(tournaments, DEFAULT_TOURNAMENT_SORT).map(({ id }) => id))
      .toEqual(["new", "middle", "old"]);
  });

  it.each([
    [{ key: "date", direction: "asc" }, ["near", "middle", "far"]],
    [{ key: "date", direction: "desc" }, ["far", "middle", "near"]],
  ] as const)("開催日を%oで並べる", (sort, expected) => {
    const tournaments = [
      createTournament("far", "2026-10-01", "2026-08-01T00:00:00.000Z"),
      createTournament("near", "2026-08-20", "2026-08-02T00:00:00.000Z"),
      createTournament("middle", "2026-09-10", "2026-08-03T00:00:00.000Z"),
    ];

    expect(sortTournaments(tournaments, sort).map(({ id }) => id)).toEqual(expected);
  });

  it("未設定または不正な日付を方向にかかわらず末尾へ並べる", () => {
    const tournaments = [
      createTournament("missing", undefined, "2026-08-01T00:00:00.000Z"),
      createTournament("valid", "2026-09-01", "2026-08-02T00:00:00.000Z"),
      createTournament("invalid", "未定", "2026-08-03T00:00:00.000Z"),
    ];

    expect(sortTournaments(tournaments, { key: "date", direction: "asc" }).map(({ id }) => id))
      .toEqual(["valid", "missing", "invalid"]);
    expect(sortTournaments(tournaments, { key: "date", direction: "desc" }).map(({ id }) => id))
      .toEqual(["valid", "missing", "invalid"]);
  });

  it("同値の相対順と元配列を維持する", () => {
    const tournaments = [
      createTournament("first", "2026-09-01", "2026-08-01T00:00:00.000Z"),
      createTournament("second", "2026-09-01", "2026-08-01T00:00:00.000Z"),
    ];
    const original = [...tournaments];

    expect(sortTournaments(tournaments, { key: "date", direction: "asc" }).map(({ id }) => id))
      .toEqual(["first", "second"]);
    expect(tournaments).toEqual(original);
  });

  it("同じ見出しは方向を反転し、別の見出しは既定方向から開始する", () => {
    const oldestFirst = getNextTournamentSort(DEFAULT_TOURNAMENT_SORT, "updatedAt");
    expect(oldestFirst).toEqual({ key: "updatedAt", direction: "asc" });

    const dateAscending = getNextTournamentSort(oldestFirst, "date");
    expect(dateAscending).toEqual({ key: "date", direction: "asc" });
    expect(getNextTournamentSort(dateAscending, "date"))
      .toEqual({ key: "date", direction: "desc" });

    const dateDescending: TournamentSort = { key: "date", direction: "desc" };
    expect(getNextTournamentSort(dateDescending, "updatedAt"))
      .toEqual({ key: "updatedAt", direction: "desc" });
  });
});

function createTournament(
  id: string,
  date: string | undefined,
  updatedAt: string,
): Tournament {
  return {
    id,
    title: id,
    date,
    matchType: "singles",
    drawSize: 16,
    seedCount: 0,
    entrants: [],
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt,
  };
}
