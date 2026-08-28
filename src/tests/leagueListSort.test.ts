import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAGUE_SORT,
  getNextLeagueSort,
  sortLeagues,
  type LeagueSort,
} from "../app/leagueListSort";
import { createDefaultLeague } from "../app/leagueModel";
import type { League } from "../domain/leagueTypes";

describe("leagueListSort", () => {
  it("初期条件では最終更新が新しいリーグから並べる", () => {
    const leagues = [
      createLeague("old", "2026-09-01", "2026-08-01T00:00:00.000Z"),
      createLeague("new", "2026-07-01", "2026-08-03T00:00:00.000Z"),
      createLeague("middle", "2026-08-01", "2026-08-02T00:00:00.000Z"),
    ];

    expect(sortLeagues(leagues, DEFAULT_LEAGUE_SORT).map(({ id }) => id))
      .toEqual(["new", "middle", "old"]);
  });

  it.each([
    [{ key: "date", direction: "asc" }, ["near", "middle", "far"]],
    [{ key: "date", direction: "desc" }, ["far", "middle", "near"]],
  ] as const)("開催日を%oで並べる", (sort, expected) => {
    const leagues = [
      createLeague("far", "2026-10-01", "2026-08-01T00:00:00.000Z"),
      createLeague("near", "2026-08-20", "2026-08-02T00:00:00.000Z"),
      createLeague("middle", "2026-09-10", "2026-08-03T00:00:00.000Z"),
    ];

    expect(sortLeagues(leagues, sort).map(({ id }) => id)).toEqual(expected);
  });

  it("未設定または不正な日付を方向にかかわらず末尾へ並べる", () => {
    const leagues = [
      createLeague("missing", undefined, "2026-08-01T00:00:00.000Z"),
      createLeague("valid", "2026-09-01", "2026-08-02T00:00:00.000Z"),
      createLeague("invalid", "未定", "2026-08-03T00:00:00.000Z"),
    ];

    expect(sortLeagues(leagues, { key: "date", direction: "asc" }).map(({ id }) => id))
      .toEqual(["valid", "missing", "invalid"]);
    expect(sortLeagues(leagues, { key: "date", direction: "desc" }).map(({ id }) => id))
      .toEqual(["valid", "missing", "invalid"]);
  });

  it("同値の相対順と元配列を維持する", () => {
    const leagues = [
      createLeague("first", "2026-09-01", "2026-08-01T00:00:00.000Z"),
      createLeague("second", "2026-09-01", "2026-08-01T00:00:00.000Z"),
    ];
    const original = [...leagues];

    expect(sortLeagues(leagues, { key: "date", direction: "asc" }).map(({ id }) => id))
      .toEqual(["first", "second"]);
    expect(leagues).toEqual(original);
  });

  it("同じ見出しは方向を反転し、別の見出しは既定方向から開始する", () => {
    const oldestFirst = getNextLeagueSort(DEFAULT_LEAGUE_SORT, "updatedAt");
    expect(oldestFirst).toEqual({ key: "updatedAt", direction: "asc" });

    const dateAscending = getNextLeagueSort(oldestFirst, "date");
    expect(dateAscending).toEqual({ key: "date", direction: "asc" });
    expect(getNextLeagueSort(dateAscending, "date"))
      .toEqual({ key: "date", direction: "desc" });

    const dateDescending: LeagueSort = { key: "date", direction: "desc" };
    expect(getNextLeagueSort(dateDescending, "updatedAt"))
      .toEqual({ key: "updatedAt", direction: "desc" });
  });
});

function createLeague(id: string, date: string | undefined, updatedAt: string): League {
  return { ...createDefaultLeague(), id, title: id, date, updatedAt };
}
