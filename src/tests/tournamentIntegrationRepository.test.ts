import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createDefaultTournament } from "../app/tournamentModel";
import { createLeagueToTournament } from "../app/leagueTournamentAdapter";
import { createDefaultLeague } from "../app/leagueModel";
import { createTournamentIntegrationRepository } from "../storage/tournamentIntegrationRepository";
import { createTournamentRepository } from "../storage/tournamentRepository";

describe("TournamentIntegrationRepository", () => {
  it("意図: 連携情報を専用ストアへ保存・取得・一覧・削除できる", async () => {
    const repository = createTournamentIntegrationRepository(new IDBFactory());
    const league = { ...createDefaultLeague(), id: "league-repository", matchSelectionStatus: "confirmed" as const };
    const linked = createLeagueToTournament({ ...createDefaultTournament(), id: "tournament-repository" }, league, { min: 1, max: 2 });

    await repository.save(linked.integration);
    expect(await repository.get("tournament-repository")).toEqual(linked.integration);
    expect(await repository.list()).toEqual([linked.integration]);

    await repository.delete("tournament-repository");
    expect(await repository.list()).toEqual([]);
  });

  it("意図: 全置換は空配列を受け入れ、重複大会IDは保存前に拒否する", async () => {
    const repository = createTournamentIntegrationRepository(new IDBFactory());
    const league = { ...createDefaultLeague(), id: "league-repository", matchSelectionStatus: "confirmed" as const };
    const linked = createLeagueToTournament({ ...createDefaultTournament(), id: "tournament-repository" }, league, { min: 1, max: 2 });

    await expect(repository.replaceAll([linked.integration, linked.integration])).rejects.toThrow("重複");
    await repository.replaceAll([]);
    expect(await repository.list()).toEqual([]);
  });

  it("意図: トーナメントと連携情報を同一トランザクションで保存・削除できる", async () => {
    const indexedDb = new IDBFactory();
    const repository = createTournamentIntegrationRepository(indexedDb);
    const tournamentRepository = createTournamentRepository(indexedDb);
    const tournament = { ...createDefaultTournament(), id: "atomic-tournament" };
    const league = { ...createDefaultLeague(), id: "atomic-league", matchSelectionStatus: "confirmed" as const };
    const linked = createLeagueToTournament(tournament, league, { min: 1, max: 2 });

    await repository.saveWithTournament(linked.tournament, linked.integration);
    expect(await tournamentRepository.get(tournament.id)).toEqual(linked.tournament);
    expect(await repository.get(tournament.id)).toEqual(linked.integration);

    await repository.deleteWithTournament(tournament.id);
    expect(await tournamentRepository.get(tournament.id)).toBeUndefined();
    expect(await repository.get(tournament.id)).toBeUndefined();
  });
});
