import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { Tournament } from "../domain/types";
import {
  initializeTournamentStorage,
  LEGACY_STORAGE_KEY,
  LOCAL_STORAGE_MIGRATION_KEY,
} from "../storage/localStorageMigration";
import { createTournamentRepository } from "../storage/tournamentRepository";

describe("localStorage migration", () => {
  it("moves legacy tournaments to IndexedDB and removes the old key after verification", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const tournament = createTournament("legacy");
    const storage = createStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, tournaments: [tournament] }),
    });

    const loaded = await initializeTournamentStorage(repository, storage);

    expect(loaded.map((item) => item.id)).toEqual(["legacy"]);
    expect(await repository.get("legacy")).toMatchObject({ title: "legacy" });
    expect(await repository.getMetadata<boolean>(LOCAL_STORAGE_MIGRATION_KEY)).toBe(true);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("keeps both existing IndexedDB data and invalid legacy data when migration fails", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    await repository.save(createTournament("indexed-db"));
    const storage = createStorage({ [LEGACY_STORAGE_KEY]: "{ invalid" });

    await expect(initializeTournamentStorage(repository, storage)).rejects.toThrow("旧データは保持");

    expect((await repository.list()).map((item) => item.id)).toEqual(["indexed-db"]);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe("{ invalid");
    expect(await repository.getMetadata<boolean>(LOCAL_STORAGE_MIGRATION_KEY)).toBeUndefined();
  });

  it("does not run migration again after the completion marker is stored", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    await repository.save(createTournament("indexed-db"));
    await repository.setMetadata(LOCAL_STORAGE_MIGRATION_KEY, true);
    const storage = createStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, tournaments: [createTournament("legacy")] }),
    });

    const loaded = await initializeTournamentStorage(repository, storage);

    expect(loaded.map((item) => item.id)).toEqual(["indexed-db"]);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});

function createStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function createTournament(id: string): Tournament {
  return {
    id,
    title: id,
    matchType: "singles",
    drawSize: 4,
    seedCount: 0,
    entrants: [],
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
