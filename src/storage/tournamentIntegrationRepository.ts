import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";
import type { Tournament } from "../domain/types";
import {
  openAppDatabase,
  requestToPromise,
  TOURNAMENT_STORE_NAME,
  TOURNAMENT_INTEGRATION_STORE_NAME,
  transactionToPromise,
} from "./appDatabase";

export type TournamentIntegrationRepository = {
  list: () => Promise<TournamentIntegrationRecord[]>;
  get: (tournamentId: string) => Promise<TournamentIntegrationRecord | undefined>;
  save: (record: TournamentIntegrationRecord) => Promise<void>;
  delete: (tournamentId: string) => Promise<void>;
  replaceAll: (records: readonly TournamentIntegrationRecord[]) => Promise<void>;
  saveWithTournament: (tournament: Tournament, record?: TournamentIntegrationRecord) => Promise<void>;
  deleteWithTournament: (tournamentId: string) => Promise<void>;
  replaceAllWithTournaments: (
    tournaments: readonly Tournament[],
    records: readonly TournamentIntegrationRecord[],
  ) => Promise<void>;
};

let sharedRepository: TournamentIntegrationRepository | undefined;

export function getTournamentIntegrationRepository(): TournamentIntegrationRepository {
  sharedRepository ??= createTournamentIntegrationRepository();
  return sharedRepository;
}

export function createTournamentIntegrationRepository(
  indexedDb: IDBFactory = indexedDB,
): TournamentIntegrationRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;
  const getDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openAppDatabase(indexedDb);
    return databasePromise;
  };

  return {
    async list() {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_INTEGRATION_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const records = await requestToPromise<TournamentIntegrationRecord[]>(
        transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).getAll(),
      );
      await completion;
      return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async get(tournamentId) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_INTEGRATION_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const record = await requestToPromise<TournamentIntegrationRecord | undefined>(
        transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).get(tournamentId),
      );
      await completion;
      return record;
    },

    async save(record) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_INTEGRATION_STORE_NAME, "readwrite");
      transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).put(record);
      await transactionToPromise(transaction);
    },

    async delete(tournamentId) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_INTEGRATION_STORE_NAME, "readwrite");
      transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).delete(tournamentId);
      await transactionToPromise(transaction);
    },

    async replaceAll(records) {
      const ids = new Set<string>();
      for (const record of records) {
        if (!record.tournamentId || ids.has(record.tournamentId)) {
          throw new Error("連携情報の大会IDが空、または重複しています。");
        }
        ids.add(record.tournamentId);
      }

      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_INTEGRATION_STORE_NAME, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME);
      store.clear();
      for (const record of records) {
        store.put(record);
      }
      await completion;
    },

    async saveWithTournament(tournament, record) {
      const database = await getDatabase();
      const transaction = database.transaction(
        [TOURNAMENT_STORE_NAME, TOURNAMENT_INTEGRATION_STORE_NAME],
        "readwrite",
      );
      transaction.objectStore(TOURNAMENT_STORE_NAME).put(tournament);
      if (record) {
        transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).put(record);
      } else {
        transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).delete(tournament.id);
      }
      await transactionToPromise(transaction);
    },

    async deleteWithTournament(tournamentId) {
      const database = await getDatabase();
      const transaction = database.transaction(
        [TOURNAMENT_STORE_NAME, TOURNAMENT_INTEGRATION_STORE_NAME],
        "readwrite",
      );
      transaction.objectStore(TOURNAMENT_STORE_NAME).delete(tournamentId);
      transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME).delete(tournamentId);
      await transactionToPromise(transaction);
    },

    async replaceAllWithTournaments(tournaments, records) {
      const tournamentIds = new Set<string>();
      for (const tournament of tournaments) {
        if (!tournament.id || tournamentIds.has(tournament.id)) {
          throw new Error("大会IDが空、または重複しています。");
        }
        tournamentIds.add(tournament.id);
      }
      const recordIds = new Set<string>();
      for (const record of records) {
        if (!record.tournamentId || recordIds.has(record.tournamentId) || !tournamentIds.has(record.tournamentId)) {
          throw new Error("連携情報の大会IDが不正、または重複しています。");
        }
        recordIds.add(record.tournamentId);
      }

      const database = await getDatabase();
      const transaction = database.transaction(
        [TOURNAMENT_STORE_NAME, TOURNAMENT_INTEGRATION_STORE_NAME],
        "readwrite",
      );
      const tournamentStore = transaction.objectStore(TOURNAMENT_STORE_NAME);
      const integrationStore = transaction.objectStore(TOURNAMENT_INTEGRATION_STORE_NAME);
      tournamentStore.clear();
      integrationStore.clear();
      for (const tournament of tournaments) tournamentStore.put(tournament);
      for (const record of records) integrationStore.put(record);
      await transactionToPromise(transaction);
    },
  };
}
