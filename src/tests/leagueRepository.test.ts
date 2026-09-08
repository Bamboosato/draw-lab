import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import type { League } from "../domain/leagueTypes";
import { createLeagueRepository } from "../storage/leagueRepository";
import { createTournamentRepository } from "../storage/tournamentRepository";

describe("LeagueRepository", () => {
  it("リーグを保存・取得・一覧・削除できる", async () => {
    const repository = createLeagueRepository(new IDBFactory());
    const league = { ...createDefaultLeague(), id: "league-1", title: "リーグA" };
    await repository.save(league);
    expect(await repository.get(league.id)).toEqual(league);
    expect((await repository.list()).map((item) => item.id)).toEqual([league.id]);
    await repository.delete(league.id);
    expect(await repository.list()).toEqual([]);
  });

  it("トーナメントとリーグを同一DBの別storeへ保存する", async () => {
    const indexedDb = new IDBFactory();
    const tournamentRepository = createTournamentRepository(indexedDb);
    const leagueRepository = createLeagueRepository(indexedDb);
    const tournament = {
      ...{
        id: "tournament-1", title: "大会", matchType: "singles" as const, drawSize: 4 as const, seedCount: 0,
        entrants: [], options: { avoidSameTeam: true, avoidSameRegion: true, prioritizeSeedBye: true },
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const league = { ...createDefaultLeague(), id: "league-1", title: "リーグ" };
    await leagueRepository.save(league);
    await tournamentRepository.save(tournament);
    expect((await leagueRepository.get(league.id))?.title).toBe("リーグ");
    expect((await tournamentRepository.get(tournament.id))?.title).toBe("大会");
  });

  it("リーグを複製すると関連IDを再発行する", async () => {
    const repository = createLeagueRepository(new IDBFactory());
    const source = { ...createDefaultLeague(), id: "league-1", title: "リーグA", participants: [{ id: "p1", displayName: "A", participantType: "individual" as const, memberNames: ["A"], selectionStatus: "selected" as const }] };
    await repository.save(source);
    const duplicated = await repository.duplicate(source.id);
    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated.participants[0]?.id).not.toBe(source.participants[0]?.id);
    expect(duplicated.title).toBe("リーグA のコピー");
  });

  it("リーグを複製すると対戦表を未確定に戻し、結果と順位を初期化する", async () => {
    const repository = createLeagueRepository(new IDBFactory());
    const source: League = {
      ...createDefaultLeague(),
      id: "league-completed",
      title: "完了済みリーグ",
      participants: [
        { id: "p1", displayName: "A", participantType: "individual", memberNames: ["A"], selectionStatus: "selected" },
        { id: "p2", displayName: "B", participantType: "individual", memberNames: ["B"], selectionStatus: "selected" },
      ],
      selection: {
        mode: "manual",
        selectedParticipantIds: ["p1", "p2"],
        reserveParticipantIds: [],
      },
      groups: [{ id: "g1", name: "A組", participantIds: ["p1", "p2"] }],
      matches: [{
        id: "m1",
        groupId: "g1",
        order: 1,
        participantAId: "p1",
        participantBId: "p2",
        isValid: false,
        result: "participantAWin",
        note: "元リーグのメモ",
      }],
      standings: [
        { groupId: "g1", participantId: "p1", played: 1, wins: 1, draws: 0, losses: 0, points: 3, manualRank: 2, rankStatus: "confirmed" },
        { groupId: "g1", participantId: "p2", played: 1, wins: 0, draws: 0, losses: 1, points: 0, manualRank: 1, rankStatus: "confirmed" },
      ],
      status: "completed",
      matchSelectionStatus: "confirmed",
    };
    await repository.save(source);

    const duplicated = await repository.duplicate(source.id);
    const duplicatedParticipantIds = new Map(source.participants.map((participant, index) => [participant.id, duplicated.participants[index]!.id]));
    const duplicatedGroupId = duplicated.groups[0]!.id;
    const duplicatedMatch = duplicated.matches[0]!;

    expect(duplicated.status).toBe("draft");
    expect(duplicated.matchSelectionStatus).toBe("pending");
    expect(duplicated.groups[0]!.participantIds).toEqual([
      duplicatedParticipantIds.get("p1"),
      duplicatedParticipantIds.get("p2"),
    ]);
    expect(duplicatedMatch).toMatchObject({
      groupId: duplicatedGroupId,
      participantAId: duplicatedParticipantIds.get("p1"),
      participantBId: duplicatedParticipantIds.get("p2"),
      isValid: true,
      result: "unplayed",
      note: "",
    });
    expect(duplicated.standings).toHaveLength(2);
    expect(duplicated.standings.every((standing) => standing.groupId === duplicatedGroupId
      && standing.played === 0
      && standing.wins === 0
      && standing.draws === 0
      && standing.losses === 0
      && standing.points === 0
      && standing.manualRank === undefined
      && standing.rankStatus === "unconfirmed")).toBe(true);
    expect(await repository.get(source.id)).toEqual(expect.objectContaining({
      ...source,
      matchFormat: 1,
      detailInputEnabled: false,
      detailDisplayEnabled: false,
      matches: [expect.objectContaining({ setScores: [{ participantA: null, participantB: null }] })],
    }));
  });

  it("全リーグをトランザクションで置換し、空配列にも対応する", async () => {
    const repository = createLeagueRepository(new IDBFactory());
    const first = { ...createDefaultLeague(), id: "league-1", title: "リーグA" };
    const second = { ...createDefaultLeague(), id: "league-2", title: "リーグB" };
    await repository.save(first);

    await repository.replaceAll([second]);
    expect((await repository.list()).map((league) => league.id)).toEqual(["league-2"]);

    await repository.replaceAll([]);
    expect(await repository.list()).toEqual([]);
  });

  it("全件置換でリーグIDの重複を拒否し、既存データを保持する", async () => {
    const repository = createLeagueRepository(new IDBFactory());
    const existing = { ...createDefaultLeague(), id: "league-1", title: "既存リーグ" };
    await repository.save(existing);

    await expect(repository.replaceAll([existing, { ...existing, title: "重複" }]))
      .rejects.toThrow("リーグIDが空、または重複しています。");
    expect(await repository.get(existing.id)).toEqual(existing);
  });
});
