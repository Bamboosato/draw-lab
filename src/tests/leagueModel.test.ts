import { describe, expect, it } from "vitest";
import {
  completeLeague,
  createDefaultLeague,
  createLeagueParticipant,
  mergeLeagueParticipantsIntoEmptyRows,
  parseLeagueParticipantsFromText,
  reopenLeague,
  selectParticipantIds,
  updateGroups,
  updateDetailDisplayEnabled,
  updateDetailInputEnabled,
  updateMatchFormat,
  updateManualRanks,
  updateMatch,
  updateMatchSetScore,
  updateMatchValidity,
  updateParticipants,
  updateScoringPolicy,
  unconfirmMatchSelection,
} from "../app/leagueModel";
import { isLeagueParticipantEmpty } from "../domain/leagueLogic";
import type { League, LeagueGroup, LeagueMatch } from "../domain/leagueTypes";

describe("league model state transitions", () => {
  describe("状態遷移観点: 結果入力と完了", () => {
    it("結果入力でinProgressになり、結果を未実施へ戻すとscheduledへ戻る", () => {
      const league = makeLeague({ status: "scheduled", matchSelectionStatus: "confirmed" });
      const started = updateMatch(league, "m1", { result: "participantAWin" });
      expect(started.status).toBe("inProgress");

      const reset = updateMatch(started, "m1", { result: "unplayed" });
      expect(reset.status).toBe("scheduled");
    });

    it("勝点設定の変更で入力済み結果の順位集計を再計算する", () => {
      const played = updateMatch(makeLeague({ status: "scheduled" }), "m1", { result: "participantAWin" });
      const updated = updateScoringPolicy(played, { winPoints: 5, drawPoints: 2, lossPoints: 0 });

      expect(played.standings.find((standing) => standing.participantId === "p1")?.points).toBe(3);
      expect(updated.standings.find((standing) => standing.participantId === "p1")?.points).toBe(5);
      expect(updated.standings.find((standing) => standing.participantId === "p2")?.points).toBe(0);
      expect(played.scoringPolicy).toEqual({ winPoints: 3, drawPoints: 1, lossPoints: 0 });
    });

    it("自動順位だけで完了でき、訂正順位は試合結果変更後も保持する", () => {
      const league = makeLeague({
        status: "inProgress",
      });
      expect(completeLeague(league).status).toBe("completed");

      const played = updateMatch(league, "m1", { result: "participantAWin" });
      const corrected = updateManualRanks(played, new Map([["p1", 2]]));
      const changed = updateMatch(corrected, "m1", { result: "unplayed" });
      expect(changed.standings.find((standing) => standing.participantId === "p1")).toMatchObject({ rank: 1, manualRank: 2 });
      expect(reopenLeague(completeLeague(league)).status).toBe("inProgress");
    });
  });

  describe("機能観点: 試合形式とセット詳細", () => {
    it("試合形式に応じたセット数を生成し、片側だけのスコアでは勝敗を自動選択しない", () => {
      const league = makeLeague({ status: "draft", matchSelectionStatus: "pending" });
      const formatted = updateMatchFormat(league, 3);
      const detailed = updateDetailInputEnabled(formatted, true);
      const scored = updateMatchSetScore(detailed, "m1", 0, "participantA", 6);
      const displayed = updateDetailDisplayEnabled(scored, true);

      expect(formatted.matchFormat).toBe(3);
      expect(displayed.matches[0]?.setScores).toHaveLength(3);
      expect(displayed.matches[0]?.setScores?.[0]).toEqual({ participantA: 6, participantB: null });
      expect(displayed.matches[0]?.result).toBe("unplayed");
      expect(displayed.detailDisplayEnabled).toBe(true);
    });

    it("1セットの両者のスコアが入力されると、未実施のカードだけ勝者を自動選択する", () => {
      const detailed = updateDetailInputEnabled(makeLeague({ status: "scheduled" }), true);
      const scoredA = updateMatchSetScore(detailed, "m1", 0, "participantA", 6);
      const scored = updateMatchSetScore(scoredA, "m1", 0, "participantB", 1);

      expect(scored.matches[0]?.result).toBe("participantAWin");
      expect(scored.status).toBe("inProgress");
      expect(scored.standings.find((standing) => standing.participantId === "p1")?.wins).toBe(1);
    });

    it("3・5セットは先取数が確定した時だけ勝者を自動選択する", () => {
      const threeSet = updateDetailInputEnabled({ ...makeLeague({ status: "scheduled" }), matchFormat: 3 }, true);
      const threeSetFirst = updateMatchSetScore(threeSet, "m1", 0, "participantA", 6);
      const threeSetSecond = updateMatchSetScore(threeSetFirst, "m1", 0, "participantB", 1);
      const threeSetThird = updateMatchSetScore(threeSetSecond, "m1", 1, "participantA", 6);
      expect(threeSetThird.matches[0]?.result).toBe("unplayed");
      const threeSetComplete = updateMatchSetScore(threeSetThird, "m1", 1, "participantB", 3);
      expect(threeSetComplete.matches[0]?.result).toBe("participantAWin");

      const fiveSet = updateDetailInputEnabled({ ...makeLeague({ status: "scheduled" }), matchFormat: 5 }, true);
      let fiveSetScored = fiveSet;
      for (const setIndex of [0, 1, 2]) {
        fiveSetScored = updateMatchSetScore(fiveSetScored, "m1", setIndex, "participantA", 6);
        fiveSetScored = updateMatchSetScore(fiveSetScored, "m1", setIndex, "participantB", 1);
      }
      expect(fiveSetScored.matches[0]?.result).toBe("participantAWin");
    });

    it("同点・入力不足では自動選択せず、選択済みの勝敗はスコア変更で上書きしない", () => {
      const detailed = updateDetailInputEnabled(makeLeague({ status: "scheduled" }), true);
      const partial = updateMatchSetScore(detailed, "m1", 0, "participantA", 6);
      const tied = updateMatchSetScore(partial, "m1", 0, "participantB", 6);
      expect(tied.matches[0]?.result).toBe("unplayed");

      const manual = updateMatch(detailed, "m1", { result: "participantBWin" });
      const changed = updateMatchSetScore(manual, "m1", 0, "participantA", 6);
      const unchanged = updateMatchSetScore(changed, "m1", 0, "participantB", 1);
      expect(unchanged.matches[0]?.result).toBe("participantBWin");

      const autoSelected = updateMatchSetScore(
        updateMatchSetScore(detailed, "m1", 0, "participantA", 6),
        "m1",
        0,
        "participantB",
        1,
      );
      const afterAutoSelectedEdit = updateMatchSetScore(autoSelected, "m1", 0, "participantB", 6);
      expect(afterAutoSelectedEdit.matches[0]?.result).toBe("participantAWin");
    });

    it("詳細入力をOFFにすると確認後の状態として全スコアと詳細表示をクリアする", () => {
      const league = updateDetailDisplayEnabled(
        updateDetailInputEnabled(updateMatchFormat(makeLeague({ status: "draft", matchSelectionStatus: "pending" }), 5), true),
        true,
      );
      const scored = updateMatchSetScore(league, "m1", 4, "participantB", 3);
      const disabled = updateDetailInputEnabled(scored, false);

      expect(disabled.detailInputEnabled).toBe(false);
      expect(disabled.detailDisplayEnabled).toBe(false);
      expect(disabled.matches[0]?.setScores).toHaveLength(5);
      expect(disabled.matches[0]?.setScores?.every((score) => score.participantA === null && score.participantB === null)).toBe(true);
    });
  });

  describe("整合性観点: 対戦カード確定後の構造変更", () => {
    it("確定後の参加単位・グループ変更を受け付けず、既存データを保持する", () => {
      const league = makeLeague({ status: "scheduled", matchSelectionStatus: "confirmed" });
      const participants = [...league.participants, { ...league.participants[0]!, id: "p3", displayName: "C", memberNames: ["C"] }];
      const nextGroup: LeagueGroup = { id: "g2", name: "B", participantIds: ["p1", "p2"] };
      expect(updateParticipants(league, participants)).toBe(league);
      expect(updateGroups(league, [nextGroup])).toBe(league);
    });

    it("確定後のカード有効状態変更を受け付けず、既存データを保持する", () => {
      const league = makeLeague({ status: "scheduled", matchSelectionStatus: "confirmed" });

      expect(updateMatchValidity(league, "m1", false)).toBe(league);
      expect(league.matches[0]?.isValid).toBe(true);
    });

    it("未確定なら結果入力済みでもカード有効状態を変更できる", () => {
      const league = makeLeague({ status: "inProgress", matchSelectionStatus: "pending", matches: [{ ...makeLeague().matches[0]!, result: "participantAWin" }] });

      const next = updateMatchValidity(league, "m1", false);

      expect(next).not.toBe(league);
      expect(next.matches[0]?.isValid).toBe(false);
    });

    it("確定解除で全結果を未実施に戻し、未確定へ戻す", () => {
      const league = makeLeague({
        status: "inProgress",
        matchSelectionStatus: "confirmed",
        matches: [{ ...makeLeague().matches[0]!, result: "participantAWin", note: "メモ" }],
      });

      const next = unconfirmMatchSelection(league);

      expect(next.matchSelectionStatus).toBe("pending");
      expect(next.status).toBe("draft");
      expect(next.matches[0]?.result).toBe("unplayed");
      expect(next.matches[0]?.note).toBe("メモ");
    });

    it("結果入力前の参加単位追加ではグループとカードをクリアする", () => {
      const league = makeLeague({ status: "draft", matchSelectionStatus: "pending" });
      const participants = [...league.participants, { ...league.participants[0]!, id: "p3", displayName: "C", memberNames: ["C"] }];
      const next = updateParticipants(league, participants);
      expect(next.groups).toEqual([]);
      expect(next.matches).toEqual([]);
      expect(next.matchSelectionStatus).toBe("pending");
    });

    it("結果入力前の参加単位更新でもグループとカードをクリアする", () => {
      const league = makeLeague({ status: "draft", matchSelectionStatus: "pending" });
      const participants = league.participants.map((participant) => participant.id === "p1"
        ? { ...participant, displayName: "A（更新）" }
        : participant);
      const next = updateParticipants(league, participants);
      expect(next.groups).toEqual([]);
      expect(next.matches).toEqual([]);
      expect(next.standings).toEqual([]);
      expect(next.matchSelectionStatus).toBe("pending");
      expect(next.status).toBe("draft");
      expect(next.scoringPolicy).toEqual(league.scoringPolicy);
    });
  });

  describe("データ観点: 参加単位入力と抽選", () => {
    it("新規リーグは定員分の空行を保持する", () => {
      const league = createDefaultLeague();

      expect(league.participants).toHaveLength(league.capacity);
      expect(league.participants.every(isLeagueParticipantEmpty)).toBe(true);
    });

    it("空行へ入力した参加単位だけを選出対象へ反映する", () => {
      const league = createDefaultLeague();
      const firstParticipant = league.participants[0]!;
      const next = updateParticipants(league, league.participants.map((participant) => participant.id === firstParticipant.id
        ? { ...participant, displayName: "参加者A" }
        : participant));

      expect(next.selection.selectedParticipantIds).toEqual([firstParticipant.id]);
      expect(next.participants.filter((participant) => participant.selectionStatus === "selected")).toHaveLength(1);
    });

    it("同じ抽選シードで同じ選出結果を再現し、定員数に切り詰める", () => {
      const ids = ["p1", "p2", "p3", "p4"];
      expect(selectParticipantIds(ids, 2, "seed-1")).toEqual(selectParticipantIds(ids, 2, "seed-1"));
      expect(selectParticipantIds(ids, 2, "seed-1")).toHaveLength(2);
    });

    it("種目区分ごとの貼り付け列を参加単位へ変換する", () => {
      const individual = parseLeagueParticipantsFromText("選手A\t所属A\t地区A\t備考A", "individual");
      const doubles = parseLeagueParticipantsFromText("ペアA\t選手A\t選手B\t所属A\t地区A\t備考A", "doubles");
      const team = parseLeagueParticipantsFromText("チームA\t選手A/選手B\t所属A\t地区A\t備考A", "team");
      expect(individual[0]?.displayName).toBe("選手A");
      expect(individual[0]?.team).toBe("所属A");
      expect(individual[0]?.region).toBe("地区A");
      expect(individual[0]?.note).toBe("備考A");
      expect(doubles[0]?.memberNames).toEqual(["選手A", "選手B"]);
      expect(doubles[0]?.region).toBe("地区A");
      expect(doubles[0]?.note).toBe("備考A");
      expect(team[0]?.memberNames).toEqual(["選手A", "選手B"]);
      expect(team[0]?.team).toBe("所属A");
      expect(team[0]?.region).toBe("地区A");
      expect(team[0]?.note).toBe("備考A");
    });

    it("貼り付け内容を既存の空行へ取り込み、入力済み参加者を保持する", () => {
      const existing = { ...createLeagueParticipant(1, "individual"), id: "p1", displayName: "既存", memberNames: ["既存"] };
      const empty = createLeagueParticipant(2, "individual");
      const incoming = parseLeagueParticipantsFromText("追加", "individual");

      const merged = mergeLeagueParticipantsIntoEmptyRows([existing, empty], incoming);

      expect(merged).toHaveLength(2);
      expect(merged[0]).toBe(existing);
      expect(merged[1]?.displayName).toBe("追加");
    });
  });
});

function makeLeague(overrides: Partial<League> = {}): League {
  const group: LeagueGroup = { id: "g1", name: "A", participantIds: ["p1", "p2"] };
  const match: LeagueMatch = { id: "m1", groupId: "g1", order: 1, participantAId: "p1", participantBId: "p2", isValid: true, result: "unplayed" };
  return {
    id: "league-1",
    title: "リーグ",
    participantType: "individual",
    capacity: 2,
    participants: [
      { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], selectionStatus: "selected" },
      { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], selectionStatus: "selected" },
    ],
    selection: { mode: "all", selectedParticipantIds: ["p1", "p2"], reserveParticipantIds: [] },
    groups: [group],
    scoringPolicy: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
    matchFormat: 1,
    detailInputEnabled: false,
    detailDisplayEnabled: false,
    matches: [match],
    standings: [
      { groupId: "g1", participantId: "p1", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" },
      { groupId: "g1", participantId: "p2", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" },
    ],
    status: "draft",
    matchSelectionStatus: "confirmed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
