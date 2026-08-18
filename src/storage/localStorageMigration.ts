import type { Tournament } from "../domain/types";
import { coerceStoredTournament } from "../app/tournamentPersistence";
import { getTournamentRepository, type TournamentRepository } from "./tournamentRepository";

export const LEGACY_STORAGE_KEY = "drawlab:tournaments";
export const LOCAL_STORAGE_MIGRATION_KEY = "localStorageMigration:v1";

type LegacyStoredData = {
  version: 1;
  tournaments: Tournament[];
};

let appInitializationPromise: Promise<Tournament[]> | undefined;

export function initializeAppTournamentStorage(): Promise<Tournament[]> {
  appInitializationPromise ??= initializeTournamentStorage(getTournamentRepository(), localStorage);
  return appInitializationPromise;
}

export async function initializeTournamentStorage(
  repository: TournamentRepository,
  legacyStorage: Pick<Storage, "getItem" | "removeItem">,
): Promise<Tournament[]> {
  const migrationCompleted = await repository.getMetadata<boolean>(LOCAL_STORAGE_MIGRATION_KEY);

  if (migrationCompleted) {
    return repository.list();
  }

  const legacyJson = legacyStorage.getItem(LEGACY_STORAGE_KEY);

  if (!legacyJson) {
    await repository.setMetadata(LOCAL_STORAGE_MIGRATION_KEY, true);
    return repository.list();
  }

  const tournaments = parseLegacyStoredData(legacyJson);
  await repository.replaceAll(tournaments);
  const migrated = await repository.list();

  if (!hasSameIds(tournaments, migrated)) {
    throw new Error("localStorageからの移行結果を確認できませんでした。旧データは保持されています。");
  }

  await repository.setMetadata(LOCAL_STORAGE_MIGRATION_KEY, true);
  try {
    legacyStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Migration is already complete; retaining the legacy copy is safe.
  }
  return migrated;
}

export function parseLegacyStoredData(text: string): Tournament[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("localStorageの旧データを解析できません。旧データは保持されています。");
  }

  if (!isLegacyStoredData(parsed)) {
    throw new Error("localStorageの旧データ形式が不正です。旧データは保持されています。");
  }

  try {
    return parsed.tournaments.map((tournament) => {
      if (!isStoredTournament(tournament)) {
        throw new Error("Invalid legacy tournament.");
      }
      return coerceStoredTournament(tournament);
    });
  } catch {
    throw new Error("localStorageの旧大会データが不正です。旧データは保持されています。");
  }
}

function isLegacyStoredData(value: unknown): value is LegacyStoredData {
  return typeof value === "object"
    && value !== null
    && "version" in value
    && value.version === 1
    && "tournaments" in value
    && Array.isArray(value.tournaments);
}

function isStoredTournament(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "id" in value
    && typeof value.id === "string"
    && value.id.length > 0
    && "entrants" in value
    && Array.isArray(value.entrants)
    && "options" in value
    && typeof value.options === "object"
    && value.options !== null
    && "createdAt" in value
    && typeof value.createdAt === "string"
    && "updatedAt" in value
    && typeof value.updatedAt === "string";
}

function hasSameIds(expected: readonly Tournament[], actual: readonly Tournament[]): boolean {
  const expectedIds = new Set(expected.map((tournament) => tournament.id));
  return actual.length === expectedIds.size
    && actual.every((tournament) => expectedIds.has(tournament.id));
}
