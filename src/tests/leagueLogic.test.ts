import { describe, expect, it } from "vitest";
import { calculateStandings, countValidMatchesByParticipant, createCandidateMatches, validateLeague, validateManualRanks } from "../domain/leagueLogic";
import { distributeLeagueParticipants } from "../domain/leagueGrouping";
import type { League, LeagueGroup, LeagueMatch, LeagueParticipant } from "../domain/leagueTypes";

describe("league domain logic", () => {
  describe("機能観点: 所属・地区を考慮したグループ振り分け", () => {
    it("同じ所属・地区を分散しながらグループ人数差を1以内にする", () => {
      const participants = [
        makeParticipant("a1", "チームA", "東地区"),
        makeParticipant("a2", "チームA", "東地区"),
        makeParticipant("a3", "チームA", "東地区"),
        makeParticipant("b1", "チームB", "西地区"),
        makeParticipant("b2", "チームB", "西地区"),
        makeParticipant("b3", "チームB", "西地区"),
      ];

      const groups = distributeLeagueParticipants(participants, 3);

      expect(groups.map((group) => group.length)).toEqual([2, 2, 2]);
      expect(groups.every((group) => new Set(group.map((id) => participants.find((participant) => participant.id === id)?.team)).size === 2)).toBe(true);
      expect(groups.every((group) => new Set(group.map((id) => participants.find((participant) => participant.id === id)?.region)).size === 2)).toBe(true);
    });

    it("完全分散できない場合も全員を保持し、人数バランスを優先する", () => {
      const participants = [
        makeParticipant("p1", "同一所属", "同一地区"),
        makeParticipant("p2", "同一所属", "同一地区"),
        makeParticipant("p3", "同一所属", "同一地区"),
      ];

      const groups = distributeLeagueParticipants(participants, 2);

      expect(groups.flat()).toHaveLength(3);
      expect(new Set(groups.flat())).toEqual(new Set(["p1", "p2", "p3"]));
      expect(groups.map((group) => group.length).sort()).toEqual([1, 2]);
      expect(Math.max(...groups.map((group) => group.length))).toBe(2);
    });
  });

  describe("非機能観点: 振り分け結果の再現性", () => {
    it("同じ入力とグループ数で同じ振り分け結果になる", () => {
      const participants = [
        makeParticipant("p1"),
        makeParticipant("p2", "チームA"),
        makeParticipant("p3", "チームA"),
        makeParticipant("p4", undefined, "東地区"),
        makeParticipant("p5", undefined, "東地区"),
      ];

      expect(distributeLeagueParticipants(participants, 2)).toEqual(distributeLeagueParticipants(participants, 2));
    });

    it("属性がない場合も人数差1以内で振り分ける", () => {
      const groups = distributeLeagueParticipants([makeParticipant("p1"), makeParticipant("p2"), makeParticipant("p3"), makeParticipant("p4"), makeParticipant("p5")], 2);

      expect(groups.map((group) => group.length)).toEqual([3, 2]);
    });
  });

  describe("機能観点: 対戦カード生成", () => {
    it("全組合せを重複なく候補カードとして生成する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3", "p4"] }];
      const matches = createCandidateMatches(groups, () => `m${Math.random()}`);
      expect(matches).toHaveLength(6);
      expect(new Set(matches.map((match) => [match.participantAId, match.participantBId].sort().join("-"))).size).toBe(6);
      expect(matches.every((match) => match.isValid)).toBe(true);
    });

    it("5参加単位以上では同じ参加単位が連続しない決定的な対戦順にする", () => {
      const createMatches = (participantCount: number) => {
        let id = 0;
        return createCandidateMatches(
          [{ id: "g1", name: "A", participantIds: Array.from({ length: participantCount }, (_, index) => `p${index + 1}`) }],
          () => `m${++id}`,
        );
      };

      for (const participantCount of [5, 6]) {
        const matches = createMatches(participantCount);

        expect(countAdjacentParticipantRepeats(matches)).toBe(0);
        expect(matches).toEqual(createMatches(participantCount));
      }
    });

    it("参加単位数が少なく完全に分離できない場合も、全組合せを保持する", () => {
      const matches = createCandidateMatches(
        [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3"] }],
        (() => { let id = 0; return () => `m${++id}`; })(),
      );

      expect(matches).toHaveLength(3);
      expect(countAdjacentParticipantRepeats(matches)).toBe(2);
    });

    it("候補カードを無効化すると参加単位ごとの有効試合数へ反映する", () => {
      const groups: LeagueGroup[] = [{ id: "g1", name: "A", participantIds: ["p1", "p2", "p3", "p4"] }];
      const allMatches = createCandidateMatches(groups, (() => { let index = 0; return () => `m${++index}`; })());
      const matches = allMatches.map((match) => match.id === "m1" ? { ...match, isValid: false } : match);
      const counts = countValidMatchesByParticipant(matches, groups[0]!.participantIds);
      expect(counts.get("p1")).toBe(2);
      expect(counts.get("p2")).toBe(2);
      expect(counts.get("p3")).toBe(3);
      expect(counts.get("p4")).toBe(3);
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

function makeParticipant(id: string, team = "", region = ""): LeagueParticipant {
  return { id, displayName: id, participantType: "individual", memberNames: [id], team, region, selectionStatus: "selected" };
}

function countAdjacentParticipantRepeats(matches: readonly LeagueMatch[]): number {
  return matches.slice(1).reduce((count, match, index) => {
    const previous = matches[index]!;
    const previousParticipants = new Set([previous.participantAId, previous.participantBId]);
    return count + (previousParticipants.has(match.participantAId) || previousParticipants.has(match.participantBId) ? 1 : 0);
  }, 0);
}

function makeLeague(groups: LeagueGroup[], matches: LeagueMatch[]): League {
  return {
    id: "league-1",
    title: "リーグ",
    participantType: "individual",
    capacity: 8,
    participants: groups.flatMap((group) => group.participantIds.map((id) => ({ id, displayName: id, participantType: "individual" as const, memberNames: [id], selectionStatus: "selected" as const }))),
    selection: { mode: "all", selectedParticipantIds: groups.flatMap((group) => group.participantIds), reserveParticipantIds: [] },
    groups,
    scoringPolicy: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
    matches,
    standings: [],
    status: "draft",
    matchSelectionStatus: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
