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

  it("WOと記録用ゲーム数をJSONへ往復する", () => {
    const source = {
      ...createDefaultLeague(),
      id: "league-1",
      title: "リーグA",
      detailInputEnabled: true,
      participants: [
        { id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], selectionStatus: "selected" as const },
        { id: "p2", displayName: "B", participantType: "individual" as const, memberNames: ["B"], selectionStatus: "selected" as const },
      ],
      groups: [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }],
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "participantAWin" as const, isWalkover: true, setScores: [{ participantA: 6, participantB: 0 }] }],
    };

    const result = parseLeagueJson(serializeLeague(source));

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "league") return;
    expect(result.league.matches[0]).toMatchObject({
      isWalkover: true,
      setScores: [{ participantA: 6, participantB: 0 }],
    });
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

  it("スキーマ1を1セット・詳細OFFとして読み込み、セットスコアを補完する", () => {
    const source = createDefaultLeague();
    const legacy = JSON.parse(JSON.stringify({
      ...source,
      participants: [
        { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], selectionStatus: "selected" },
        { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], selectionStatus: "selected" },
      ],
      groups: [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }],
      matches: [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "unplayed" }],
    })) as Record<string, unknown>;
    delete legacy.matchFormat;
    delete legacy.detailInputEnabled;
    delete legacy.detailDisplayEnabled;

    const result = parseLeagueJson(JSON.stringify({
      kind: "draw-lab-league",
      schemaVersion: 1,
      exportedAt: "2026-08-28T00:00:00.000Z",
      league: legacy,
    }));

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "league") return;
    expect(result.league.matchFormat).toBe(1);
    expect(result.league.detailInputEnabled).toBe(false);
    expect(result.league.detailDisplayEnabled).toBe(false);
    expect(result.league.matches[0]?.setScores).toEqual([{ participantA: null, participantB: null }]);
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
