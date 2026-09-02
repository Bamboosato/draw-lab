import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import { calculateLeagueDrawSize, createLeagueToTournament, getLeagueRankUpperBound, resolveLeagueDrawSize, syncTournamentIntegrationParticipants, updateTournamentIntegrationPlacement } from "../app/leagueTournamentAdapter";
import { createDefaultTournament } from "../app/tournamentModel";
import type { League } from "../domain/leagueTypes";

function makeLeague(overrides: Partial<League> = {}): League {
  const base = createDefaultLeague();
  return {
    ...base,
    id: "league-source",
    title: "春季リーグ",
    date: "2026-09-01",
    venue: "体育館A",
    eventName: "団体戦",
    participantType: "team",
    capacity: 4,
    participants: [
      { id: "p1", displayName: "Team A", participantType: "team", memberNames: ["A1", "A2"], team: "所属X", region: "東", selectionStatus: "selected" },
      { id: "p2", displayName: "Team B", participantType: "team", memberNames: ["B1"], team: "所属Y", region: "西", selectionStatus: "selected" },
      { id: "p3", displayName: "Team C", participantType: "team", memberNames: ["C1"], team: "所属X", region: "東", selectionStatus: "selected" },
      { id: "p4", displayName: "Team D", participantType: "team", memberNames: ["D1"], team: "所属Z", region: "西", selectionStatus: "reserve" },
    ],
    selection: { mode: "manual", selectedParticipantIds: ["p1", "p2", "p3"], reserveParticipantIds: ["p4"] },
    groups: [
      { id: "g1", name: "A組", participantIds: ["p1", "p2"] },
      { id: "g2", name: "B組", participantIds: ["p3"] },
    ],
    standings: [
      { groupId: "g1", participantId: "p1", played: 1, wins: 1, draws: 0, losses: 0, points: 3, manualRank: 1, rankStatus: "confirmed" },
      { groupId: "g1", participantId: "p2", played: 1, wins: 0, draws: 0, losses: 1, points: 0, manualRank: 2, rankStatus: "confirmed" },
      { groupId: "g2", participantId: "p3", played: 0, wins: 0, draws: 0, losses: 0, points: 0, rankStatus: "unconfirmed" },
    ],
    status: "scheduled",
    matchSelectionStatus: "confirmed",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("leagueTournamentAdapter", () => {
  it("意図: グループ数と順位区分の順位数から対応するドローサイズを算出する", () => {
    expect(calculateLeagueDrawSize(4, { min: 1, max: 2 })).toBe(8);
    expect(resolveLeagueDrawSize(4, { min: 1, max: 2 })).toBe(8);
    expect(resolveLeagueDrawSize(3, { min: 1, max: 2 })).toBeUndefined();
  });

  it("意図: 順位区分の上限を各グループ人数の最小値として算出する", () => {
    expect(getLeagueRankUpperBound(makeLeague())).toBe(1);
  });

  it("意図: 対戦カード未確定のリーグは引継ぎ元として受け付けない", () => {
    expect(() => createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, makeLeague({ matchSelectionStatus: "pending" }), { min: 1, max: 2 }))
      .toThrow("対戦カードが確定");
  });

  it("意図: 選択済みの共通参加者情報と基本情報だけをトーナメントへ引き継ぐ", () => {
    const result = createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, makeLeague(), { min: 1, max: 2 });

    expect(result.tournament).toMatchObject({
      title: "春季リーグ（1-2位）",
      date: "2026-09-01",
      venue: "体育館A",
      eventName: "団体戦",
      matchType: "team",
      drawSize: 4,
    });
    expect(result.tournament.entrants).toHaveLength(4);
    expect(result.tournament.entrants.filter((entrant) => entrant.teamName)).toHaveLength(3);
    expect(result.tournament.entrants[0]).toMatchObject({
      teamName: "Team A",
      memberNames: ["A1", "A2"],
      team1: "所属X",
      region: "東",
    });
    expect(result.tournament.entrants.some((entrant) => entrant.teamName === "Team D")).toBe(false);
    expect(result.integration.participants.slice(0, 2)).toMatchObject([
      { tournamentEntrantId: result.tournament.entrants[0].id, sourceParticipantId: "p1", groupKey: "g1", groupLabel: "A組", rank: 1, rankOrigin: "league" },
      { tournamentEntrantId: result.tournament.entrants[1].id, sourceParticipantId: "p2", groupKey: "g1", rank: 2 },
    ]);
    expect(result.integration.sourceGroupSizes).toEqual([2, 1]);
  });

  it("意図: 自動順位を引き継ぎ、訂正順位があればそれを優先する", () => {
    const league = makeLeague({ standings: [] });
    const result = createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, league, { min: 1, max: 4 });
    const p3 = result.integration.participants.find((participant) => participant.sourceParticipantId === "p3")!;
    expect(p3.rank).toBe(1);

    const edited = updateTournamentIntegrationPlacement(result.integration, p3.tournamentEntrantId, {
      groupKey: "g3",
      groupLabel: "C組",
      rank: 3,
    });
    expect(edited.participants.find((participant) => participant.tournamentEntrantId === p3.tournamentEntrantId)).toMatchObject({
      groupKey: "g3",
      groupLabel: "C組",
      rank: 3,
      rankOrigin: "tournament-manual",
    });
  });

  it("意図: リーグ側の訂正順位を自動順位より優先して引き継ぐ", () => {
    const league = makeLeague({
      standings: makeLeague().standings.map((standing) => standing.participantId === "p1"
        ? { ...standing, rank: 1, manualRank: 2, rankStatus: "confirmed" as const }
        : standing),
    });
    const result = createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, league, { min: 1, max: 2 });

    expect(result.integration.participants.find((participant) => participant.sourceParticipantId === "p1")).toMatchObject({ rank: 2, rankOrigin: "league" });
  });

  it("意図: 名簿行の追加・削除時も既存の連携項目を参加者IDで保持する", () => {
    const result = createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, makeLeague(), { min: 1, max: 2 });
    const synced = syncTournamentIntegrationParticipants(result.integration, result.tournament.entrants.slice(0, 1));
    expect(synced.participants).toHaveLength(1);
    expect(synced.participants[0]?.sourceParticipantId).toBe("p1");
  });
});
