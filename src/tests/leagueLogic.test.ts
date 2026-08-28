import { describe, expect, it } from "vitest";
import { calculateStandings, createCandidateMatches, validateLeague, validateManualRanks, validatePartialMatchSelection } from "../domain/leagueLogic";
import type { League, LeagueGroup, LeagueMatch } from "../domain/leagueTypes";

describe("league domain logic", () => {
  describe("機能観点: 対戦カード生成", () => {
    it("総当たり相当の全組合せを重複なく生成する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3", "p4"] }];
      const matches = createCandidateMatches(groups, () => `m${Math.random()}`);
      expect(matches).toHaveLength(6);
      expect(new Set(matches.map((match) => [match.participantAId, match.participantBId].sort().join("-"))).size).toBe(6);
      expect(matches.every((match) => match.isValid)).toBe(true);
    });

    it("4参加単位で各2試合を有効にすると4カードになる", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3", "p4"] }];
      const allMatches = createCandidateMatches(groups, (() => { let index = 0; return () => `m${++index}`; })());
      const matches = allMatches.map((match) => ({ ...match, isValid: ["m1", "m2", "m5", "m6"].includes(match.id) }));
      const league = makeLeague(groups, matches, 2);
      expect(validatePartialMatchSelection(league).errors).toEqual([]);
    });

    it("3参加単位で各1試合は合計試合数が奇数のため確定できない", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3"] }];
      const matches = createCandidateMatches(groups, (() => { let index = 0; return () => `m${++index}`; })());
      const league = makeLeague(groups, matches, 1);
      expect(validatePartialMatchSelection(league).errors.some((issue) => issue.code === "PARTIAL_MATCH_PARITY")).toBe(true);
    });

    it("指定試合数と参加単位ごとの有効試合数が一致しない場合を検出する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3", "p4"] }];
      const matches = createCandidateMatches(groups, (() => { let index = 0; return () => `m${++index}`; })()).map((match, index) => ({ ...match, isValid: index < 2 }));
      const league = makeLeague(groups, matches, 2);
      expect(validatePartialMatchSelection(league).errors.some((issue) => issue.code === "PARTIAL_MATCH_COUNT_MISMATCH")).toBe(true);
    });
  });

  describe("データ観点: 集計と順位", () => {
    it("大会名が未入力でもリーグのドメイン検証を通過する", () => {
      const league = makeLeague([], []);
      expect(validateLeague({ ...league, title: "" }).errors.some((issue) => issue.field === "title")).toBe(false);
    });

    it("定員分の空行は参加者名エラーにせず、実参加者なしとして扱う", () => {
      const league = makeLeague([], []);
      const emptyRow = { id: "empty", displayName: "", participantType: "individual" as const, memberNames: [], selectionStatus: "excluded" as const };
      const errors = validateLeague({ ...league, participants: [emptyRow] }).errors;

      expect(errors.some((issue) => issue.code === "PARTICIPANT_NAME_REQUIRED")).toBe(false);
      expect(errors.some((issue) => issue.code === "PARTICIPANT_REQUIRED")).toBe(true);
    });

    it("勝点は0と100を受け入れ、範囲外や小数を拒否する", () => {
      const valid = makeLeague([], []).scoringPolicy;
      const base = makeLeague([], []);
      expect(validateLeague({ ...base, scoringPolicy: { winPoints: 100, drawPoints: 0, lossPoints: 0 } }).errors.some((issue) => issue.code === "SCORING_INVALID")).toBe(false);
      expect(validateLeague({ ...base, scoringPolicy: { ...valid, winPoints: 101 } }).errors.some((issue) => issue.code === "SCORING_INVALID")).toBe(true);
      expect(validateLeague({ ...base, scoringPolicy: { ...valid, drawPoints: 1.5 } }).errors.some((issue) => issue.code === "SCORING_INVALID")).toBe(true);
    });

    it("有効かつ結果入力済みのカードだけを勝点へ反映する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }];
      const matches: LeagueMatch[] = [{ id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "participantAWin" }, { id: "m2", groupId: "g1", order: 2, participantAId: "p1", participantBId: "p2", isValid: false, result: "participantBWin" }];
      const standings = calculateStandings(groups, matches, { winPoints: 3, drawPoints: 1, lossPoints: 0 });
      expect(standings.find((standing) => standing.participantId === "p1")?.points).toBe(3);
      expect(standings.find((standing) => standing.participantId === "p2")?.losses).toBe(1);
    });

    it("順位の一部未入力を作業中に保持し、完了時は拒否する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2"] }];
      const league = {
        ...makeLeague(groups, []),
        standings: [
          { groupId: "g1", participantId: "p1", played: 0, wins: 0, draws: 0, losses: 0, points: 0, manualRank: 1, rankStatus: "confirmed" as const },
          { groupId: "g1", participantId: "p2", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" as const },
        ],
      };
      expect(validateManualRanks(league).errors).toHaveLength(1);
    });

    it("ダブルスはメンバー2名、チームはメンバー1名以上を要求する", () => {
      const base = makeLeague([], []);
      const doubles: League = {
        ...base,
        participantType: "doubles",
        participants: [{ id: "p1", displayName: "ペア", participantType: "doubles", memberNames: ["選手A"], selectionStatus: "selected" }],
      };
      const team: League = {
        ...base,
        participantType: "team",
        participants: [{ id: "p1", displayName: "チーム", participantType: "team", memberNames: [], selectionStatus: "selected" }],
      };
      expect(validateLeague(doubles).errors.some((issue) => issue.code === "DOUBLES_MEMBER_COUNT")).toBe(true);
      expect(validateLeague(team).errors.some((issue) => issue.code === "TEAM_MEMBER_COUNT")).toBe(true);
    });
  });
});

function makeLeague(groups: LeagueGroup[], matches: LeagueMatch[], matchesPerParticipant?: number): League {
  return {
    id: "league-1",
    title: "リーグ",
    participantType: "individual",
    capacity: 8,
    participants: groups.flatMap((group) => group.participantIds.map((id) => ({ id, displayName: id, participantType: "individual" as const, memberNames: [id], selectionStatus: "selected" as const }))),
    selection: { mode: "all", selectedParticipantIds: groups.flatMap((group) => group.participantIds), reserveParticipantIds: [] },
    groups,
    matchPolicy: { mode: "partialRoundRobin", matchesPerParticipant },
    scoringPolicy: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
    matches,
    standings: [],
    status: "draft",
    matchSelectionStatus: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
