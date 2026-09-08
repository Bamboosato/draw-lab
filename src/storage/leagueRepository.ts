import type { League } from "../domain/leagueTypes";
import { calculateStandings } from "../domain/leagueLogic";
import { createEmptySetScores } from "../domain/leagueTypes";
import { normalizeLeague } from "../app/leagueModel";
import {
  LEAGUE_STORE_NAME,
  openAppDatabase,
  requestToPromise,
  transactionToPromise,
} from "./appDatabase";

export type LeagueRepository = {
  list: () => Promise<League[]>;
  get: (id: string) => Promise<League | undefined>;
  save: (league: League) => Promise<void>;
  delete: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<League>;
  replaceAll: (leagues: readonly League[]) => Promise<void>;
};

let sharedRepository: LeagueRepository | undefined;

export function getLeagueRepository(): LeagueRepository {
  sharedRepository ??= createLeagueRepository();
  return sharedRepository;
}

export function createLeagueRepository(indexedDb: IDBFactory = indexedDB): LeagueRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;

  const getDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openAppDatabase(indexedDb);
    return databasePromise;
  };

  return {
    async list() {
      const database = await getDatabase();
      const transaction = database.transaction(LEAGUE_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const leagues = await requestToPromise<League[]>(transaction.objectStore(LEAGUE_STORE_NAME).getAll());
      await completion;
      return leagues.map(normalizeLeague).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async get(id) {
      const database = await getDatabase();
      const transaction = database.transaction(LEAGUE_STORE_NAME, "readonly");
      const completion = transactionToPromise(transaction);
      const league = await requestToPromise<League | undefined>(transaction.objectStore(LEAGUE_STORE_NAME).get(id));
      await completion;
      return league ? normalizeLeague(league) : undefined;
    },

    async save(league) {
      const database = await getDatabase();
      const transaction = database.transaction(LEAGUE_STORE_NAME, "readwrite");
      transaction.objectStore(LEAGUE_STORE_NAME).put(league);
      await transactionToPromise(transaction);
    },

    async delete(id) {
      const database = await getDatabase();
      const transaction = database.transaction(LEAGUE_STORE_NAME, "readwrite");
      transaction.objectStore(LEAGUE_STORE_NAME).delete(id);
      await transactionToPromise(transaction);
    },

    async duplicate(id) {
      const source = await this.get(id);
      if (!source) {
        throw new Error("複製元のリーグが見つかりません。");
      }
      const now = new Date().toISOString();
      const participantIdMap = new Map<string, string>();
      const participants = source.participants.map((participant) => {
        const participantId = createId("participant");
        participantIdMap.set(participant.id, participantId);
        return { ...participant, id: participantId };
      });
      const groupIdMap = new Map<string, string>();
      const groups = source.groups.map((group) => {
        const groupId = createId("group");
        groupIdMap.set(group.id, groupId);
        return {
          ...group,
          id: groupId,
          participantIds: group.participantIds.map((participantId) => participantIdMap.get(participantId) ?? participantId),
        };
      });
      const matches = source.matches.map((match) => ({
        ...match,
        id: createId("match"),
        groupId: groupIdMap.get(match.groupId) ?? match.groupId,
        participantAId: participantIdMap.get(match.participantAId) ?? match.participantAId,
        participantBId: participantIdMap.get(match.participantBId) ?? match.participantBId,
        isValid: true,
        result: "unplayed" as const,
        setScores: createEmptySetScores(source.matchFormat),
        note: "",
      }));
      const duplicated: League = {
        ...source,
        id: createId("league"),
        title: `${source.title || "無題のリーグ"} のコピー`,
        participants,
        selection: {
          ...source.selection,
          selectedParticipantIds: source.selection.selectedParticipantIds.map((participantId) => participantIdMap.get(participantId) ?? participantId),
          reserveParticipantIds: source.selection.reserveParticipantIds.map((participantId) => participantIdMap.get(participantId) ?? participantId),
        },
        groups,
        matches,
        standings: calculateStandings(groups, matches, source.scoringPolicy),
        status: "draft",
        matchSelectionStatus: "pending",
        createdAt: now,
        updatedAt: now,
      };
      await this.save(duplicated);
      return duplicated;
    },

    async replaceAll(leagues) {
      assertUniqueLeagueIds(leagues);

      const database = await getDatabase();
      const transaction = database.transaction(LEAGUE_STORE_NAME, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(LEAGUE_STORE_NAME);

      try {
        store.clear();
        for (const league of leagues) {
          store.put(league);
        }

        const storedKeys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
        const expectedIds = new Set(leagues.map((league) => league.id));
        const matches = storedKeys.length === expectedIds.size
          && storedKeys.every((key) => typeof key === "string" && expectedIds.has(key));

        if (!matches) {
          transaction.abort();
          throw new Error("IndexedDBへのリーグ全件保存を確認できませんでした。");
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
  };
}

function assertUniqueLeagueIds(leagues: readonly League[]): void {
  const ids = new Set<string>();

  for (const league of leagues) {
    if (!league.id || ids.has(league.id)) {
      throw new Error("リーグIDが空、または重複しています。");
    }
    ids.add(league.id);
  }
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
