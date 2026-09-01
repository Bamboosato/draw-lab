export const DATABASE_NAME = "draw-lab";
export const DATABASE_VERSION = 3;
export const TOURNAMENT_STORE_NAME = "tournaments";
export const LEAGUE_STORE_NAME = "leagues";
export const METADATA_STORE_NAME = "metadata";
export const TOURNAMENT_INTEGRATION_STORE_NAME = "tournamentIntegrations";

export function openAppDatabase(indexedDb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(TOURNAMENT_STORE_NAME)) {
        const tournamentStore = database.createObjectStore(TOURNAMENT_STORE_NAME, { keyPath: "id" });
        tournamentStore.createIndex("updatedAt", "updatedAt");
      }

      if (!database.objectStoreNames.contains(LEAGUE_STORE_NAME)) {
        const leagueStore = database.createObjectStore(LEAGUE_STORE_NAME, { keyPath: "id" });
        leagueStore.createIndex("updatedAt", "updatedAt");
      }

      if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
        database.createObjectStore(METADATA_STORE_NAME, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(TOURNAMENT_INTEGRATION_STORE_NAME)) {
        const integrationStore = database.createObjectStore(TOURNAMENT_INTEGRATION_STORE_NAME, { keyPath: "tournamentId" });
        integrationStore.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDBを開けませんでした。"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDBの更新がほかのタブによりブロックされています。"));
    };
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB操作に失敗しました。"));
  });
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDBトランザクションが中断されました。"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDBトランザクションに失敗しました。"));
  });
}
