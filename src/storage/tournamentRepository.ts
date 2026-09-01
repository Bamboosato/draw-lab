import type { Tournament } from "../domain/types";
import {
  METADATA_STORE_NAME,
  openAppDatabase,
  requestToPromise,
  TOURNAMENT_STORE_NAME,
  transactionToPromise,
} from "./appDatabase";

export {
  DATABASE_NAME,
  DATABASE_VERSION,
  METADATA_STORE_NAME,
  TOURNAMENT_INTEGRATION_STORE_NAME,
  TOURNAMENT_STORE_NAME,
} from "./appDatabase";

type MetadataRecord = {
  key: string;
  value: unknown;
};

export type TournamentRepository = {
  list: () => Promise<Tournament[]>;
  get: (id: string) => Promise<Tournament | undefined>;
  save: (tournament: Tournament) => Promise<void>;
  delete: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Tournament>;
  replaceAll: (tournaments: readonly Tournament[]) => Promise<void>;
  getMetadata: <T>(key: string) => Promise<T | undefined>;
  setMetadata: (key: string, value: unknown) => Promise<void>;
};

let sharedRepository: TournamentRepository | undefined;

export function getTournamentRepository(): TournamentRepository {
  sharedRepository ??= createTournamentRepository();
  return sharedRepository;
}

export function createTournamentRepository(
  indexedDb: IDBFactory = indexedDB,
): TournamentRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;

  const getDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openAppDatabase(indexedDb);
    return databasePromise;
  };

  return {
    async list() {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const tournaments = await requestToPromise<Tournament[]>(
        transaction.objectStore(TOURNAMENT_STORE_NAME).getAll(),
      );
      await completion;

      return tournaments.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async get(id) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const tournament = await requestToPromise<Tournament | undefined>(
        transaction.objectStore(TOURNAMENT_STORE_NAME).get(id),
      );
      await completion;
      return tournament;
    },

    async save(tournament) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readwrite");
      transaction.objectStore(TOURNAMENT_STORE_NAME).put(tournament);
      await transactionToPromise(transaction);
    },

    async delete(id) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readwrite");
      transaction.objectStore(TOURNAMENT_STORE_NAME).delete(id);
      await transactionToPromise(transaction);
    },

    async duplicate(id) {
      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(TOURNAMENT_STORE_NAME);
      const source = await requestToPromise<Tournament | undefined>(store.get(id));

      if (!source) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("複製元の大会が見つかりません。");
      }

      const now = new Date().toISOString();
      const duplicated: Tournament = {
        ...source,
        id: createEntityId("tournament"),
        title: `${source.title || "無題のトーナメント"} のコピー`,
        entrants: source.entrants.map((entrant) => ({
          ...entrant,
          id: createEntityId("entrant"),
        })),
        options: {
          ...source.options,
          randomSeed: undefined,
        },
        generatedDraw: undefined,
        createdAt: now,
        updatedAt: now,
      };
      store.put(duplicated);
      await completion;
      return duplicated;
    },

    async replaceAll(tournaments) {
      assertUniqueTournamentIds(tournaments);

      const database = await getDatabase();
      const transaction = database.transaction(TOURNAMENT_STORE_NAME, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(TOURNAMENT_STORE_NAME);

      try {
        store.clear();
        for (const tournament of tournaments) {
          store.put(tournament);
        }

        const storedKeys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
        const expectedIds = new Set(tournaments.map((tournament) => tournament.id));
        const matches = storedKeys.length === expectedIds.size
          && storedKeys.every((key) => typeof key === "string" && expectedIds.has(key));

        if (!matches) {
          transaction.abort();
          throw new Error("IndexedDBへの全件保存を確認できませんでした。");
        }

        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be complete or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    },

    async getMetadata<T>(key: string) {
      const database = await getDatabase();
      const transaction = database.transaction(METADATA_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const record = await requestToPromise<MetadataRecord | undefined>(
        transaction.objectStore(METADATA_STORE_NAME).get(key),
      );
      await completion;
      return record?.value as T | undefined;
    },

    async setMetadata(key, value) {
      const database = await getDatabase();
      const transaction = database.transaction(METADATA_STORE_NAME, "readwrite");
      transaction.objectStore(METADATA_STORE_NAME).put({ key, value } satisfies MetadataRecord);
      await transactionToPromise(transaction);
    },
  };
}

function assertUniqueTournamentIds(tournaments: readonly Tournament[]): void {
  const ids = new Set<string>();

  for (const tournament of tournaments) {
    if (!tournament.id || ids.has(tournament.id)) {
      throw new Error("大会IDが空、または重複しています。");
    }
    ids.add(tournament.id);
  }
}

function createEntityId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
