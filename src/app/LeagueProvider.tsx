import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { League } from "../domain/leagueTypes";
import { getLeagueRepository } from "../storage/leagueRepository";
import { createDefaultLeague, hasLeagueContentChanged, touchLeague } from "./leagueModel";

export type LeagueStorageStatus = "loading" | "ready" | "saving" | "error";

type LeagueContextValue = {
  leagues: League[];
  storageStatus: LeagueStorageStatus;
  storageError?: string;
  createLeague: () => League;
  updateLeague: (league: League) => void;
  deleteLeague: (id: string) => void;
  duplicateLeague: (id: string) => Promise<League | undefined>;
  importLeague: (league: League) => void;
  replaceAllLeagues: (leagues: readonly League[]) => Promise<void>;
};

const LeagueContext = createContext<LeagueContextValue | undefined>(undefined);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => getLeagueRepository(), []);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [storageStatus, setStorageStatus] = useState<LeagueStorageStatus>("loading");
  const [storageError, setStorageError] = useState<string>();
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationsRef = useRef(0);
  const persistenceBatchFailedRef = useRef(false);
  const pendingLeagueSavesRef = useRef(new Map<string, League>());
  const leagueSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let active = true;
    void repository.list()
      .then((loaded) => {
        if (!active) return;
        setLeagues(loaded);
        setStorageStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStorageStatus("error");
        setStorageError(getErrorMessage(error, "リーグデータを読み込めませんでした。"));
      });
    return () => { active = false; };
  }, [repository]);

  const enqueuePersistence = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    if (pendingOperationsRef.current === 0) {
      persistenceBatchFailedRef.current = false;
      setStorageError(undefined);
    }
    pendingOperationsRef.current += 1;
    setStorageStatus("saving");
    const run = queueRef.current.catch(() => undefined).then(operation);
    queueRef.current = run.then(() => undefined);
    void run.then(() => {
      pendingOperationsRef.current -= 1;
      if (pendingOperationsRef.current === 0) setStorageStatus(persistenceBatchFailedRef.current ? "error" : "ready");
    }).catch((error: unknown) => {
      pendingOperationsRef.current -= 1;
      persistenceBatchFailedRef.current = true;
      setStorageStatus(pendingOperationsRef.current === 0 ? "error" : "saving");
      setStorageError(getErrorMessage(error, "リーグデータの保存に失敗しました。"));
    });
    return run;
  }, []);

  const scheduleLeagueSave = useCallback((league: League) => {
    pendingLeagueSavesRef.current.set(league.id, league);
    const currentTimer = leagueSaveTimersRef.current.get(league.id);
    if (currentTimer) clearTimeout(currentTimer);

    const timer = setTimeout(() => {
      leagueSaveTimersRef.current.delete(league.id);
      const pendingLeague = pendingLeagueSavesRef.current.get(league.id);
      if (!pendingLeague) return;
      pendingLeagueSavesRef.current.delete(league.id);
      void enqueuePersistence(() => repository.save(pendingLeague));
    }, 300);
    leagueSaveTimersRef.current.set(league.id, timer);
  }, [enqueuePersistence, repository]);

  const createLeague = useCallback(() => {
    const league = createDefaultLeague();
    setLeagues((current) => [league, ...current]);
    void enqueuePersistence(() => repository.save(league));
    return league;
  }, [enqueuePersistence, repository]);

  const updateLeague = useCallback((league: League) => {
    const current = leagues.find((item) => item.id === league.id);
    if (current && !hasLeagueContentChanged(current, league)) return;
    const next = touchLeague(league);
    setLeagues((items) => items.some((item) => item.id === next.id)
      ? items.map((item) => item.id === next.id ? next : item)
      : [next, ...items]);
    scheduleLeagueSave(next);
  }, [leagues, scheduleLeagueSave]);

  const deleteLeague = useCallback((id: string) => {
    const timer = leagueSaveTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    leagueSaveTimersRef.current.delete(id);
    pendingLeagueSavesRef.current.delete(id);
    setLeagues((current) => current.filter((league) => league.id !== id));
    void enqueuePersistence(() => repository.delete(id));
  }, [enqueuePersistence, repository]);

  const duplicateLeague = useCallback(async (id: string) => {
    try {
      const duplicated = await enqueuePersistence(() => repository.duplicate(id));
      setLeagues((current) => [duplicated, ...current]);
      return duplicated;
    } catch {
      return undefined;
    }
  }, [enqueuePersistence, repository]);

  const importLeague = useCallback((league: League) => {
    setLeagues((current) => [league, ...current]);
    void enqueuePersistence(() => repository.save(league));
  }, [enqueuePersistence, repository]);

  const replaceAllLeagues = useCallback(async (replacement: readonly League[]) => {
    for (const timer of leagueSaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    leagueSaveTimersRef.current.clear();
    pendingLeagueSavesRef.current.clear();

    const next = [...replacement];
    await enqueuePersistence(() => repository.replaceAll(next));
    setLeagues(next);
  }, [enqueuePersistence, repository]);

  const value = useMemo<LeagueContextValue>(() => ({
    leagues,
    storageStatus,
    storageError,
    createLeague,
    updateLeague,
    deleteLeague,
    duplicateLeague,
    importLeague,
    replaceAllLeagues,
  }), [createLeague, deleteLeague, duplicateLeague, importLeague, leagues, replaceAllLeagues, storageError, storageStatus, updateLeague]);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeagues(): LeagueContextValue {
  const context = useContext(LeagueContext);
  if (!context) throw new Error("useLeagues must be used inside LeagueProvider.");
  return context;
}

export function useLeague(id: string | undefined): League | undefined {
  const { leagues } = useLeagues();
  return leagues.find((league) => league.id === id);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
