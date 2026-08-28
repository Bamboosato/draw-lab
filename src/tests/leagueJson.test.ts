import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import {
  parseLeagueJson,
  serializeAllLeagues,
  serializeLeague,
} from "../storage/leagueJson";

describe("leagueJson", () => {
  it("個別リーグをJSONへ往復し、追加用にIDを再発行する", () => {
    const source = {
      ...createDefaultLeague(),
      id: "league-1",
      title: "リーグA",
    };

    const result = parseLeagueJson(serializeLeague(source), "2026-08-28T00:00:00.000Z");

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "league") return;
    expect(result.league.title).toBe("リーグA");
    expect(result.league.id).not.toBe(source.id);
    expect(result.league.createdAt).toBe("2026-08-28T00:00:00.000Z");
  });

  it("全リーグバックアップを認識し、置換復元用のIDと日時を保持する", () => {
    const source = {
      ...createDefaultLeague(),
      id: "league-1",
      title: "リーグA",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };

    const result = parseLeagueJson(
      serializeAllLeagues([source], "2026-08-28T00:00:00.000Z"),
      "2026-08-29T00:00:00.000Z",
    );

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "backup") return;
    expect(result.backup.leagues).toHaveLength(1);
    expect(result.backup.leagues[0]?.id).toBe(source.id);
    expect(result.backup.leagues[0]?.createdAt).toBe(source.createdAt);
    expect(result.backup.leagues[0]?.updatedAt).toBe(source.updatedAt);
  });

  it.each([
    ["", "empty"],
    ["{", "error"],
    [JSON.stringify({ kind: "draw-lab-league", schemaVersion: 99 }), "error"],
  ] as const)("不正または未入力のJSONを安全に扱う: %s", (text, state) => {
    expect(parseLeagueJson(text).state).toBe(state);
  });

  it("空の全リーグバックアップを有効な置換データとして扱う", () => {
    const result = parseLeagueJson(serializeAllLeagues([], "2026-08-28T00:00:00.000Z"));

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "backup") return;
    expect(result.backup.leagues).toEqual([]);
  });
});
