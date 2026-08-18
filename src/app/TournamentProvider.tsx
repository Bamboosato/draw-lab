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
import type { Tournament } from "../domain/types";
import { initializeAppTournamentStorage } from "../storage/localStorageMigration";
import { getTournamentRepository } from "../storage/tournamentRepository";
import {
  createDefaultTournament,
  hasTournamentContentChanged,
  touchTournament,
} from "./tournamentModel";

export type StorageStatus = "loading" | "ready" | "saving" | "error";

type TournamentContextValue = {
  tournaments: Tournament[];
  storageStatus: StorageStatus;
  storageError?: string;
  createTournament: () => Tournament;
  updateTournament: (tournament: Tournament) => void;
  deleteTournament: (id: string) => void;
  duplicateTournament: (id: string) => Promise<Tournament | undefined>;
  importTournament: (tournament: Tournament) => void;
  replaceAllTournaments: (tournaments: readonly Tournament[]) => Promise<void>;
};

const TournamentContext = createContext<TournamentContextValue | undefined>(undefined);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => getTournamentRepository(), []);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageError, setStorageError] = useState<string>();
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationsRef = useRef(0);
  const persistenceBatchFailedRef = useRef(false);

  useEffect(() => {
    let active = true;

    void initializeAppTournamentStorage()
      .then((loaded) => {
        if (!active) {
          return;
        }
        setTournaments(loaded);
        setStorageStatus("ready");
        setStorageError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStorageStatus("error");
        setStorageError(getErrorMessage(error, "保存データを読み込めませんでした。"));
      });

    return () => {
      active = false;
    };
  }, []);

  const enqueuePersistence = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    if (pendingOperationsRef.current === 0) {
      persistenceBatchFailedRef.current = false;
      setStorageError(undefined);
    }
    pendingOperationsRef.current += 1;
    setStorageStatus("saving");

    const run = queueRef.current.catch(() => undefined).then(operation);
    queueRef.current = run.then(() => undefined);

    void run
      .then(() => {
        pendingOperationsRef.current -= 1;
        if (pendingOperationsRef.current === 0) {
          setStorageStatus(persistenceBatchFailedRef.current ? "error" : "ready");
        }
      })
      .catch((error: unknown) => {
        pendingOperationsRef.current -= 1;
        persistenceBatchFailedRef.current = true;
        setStorageStatus(pendingOperationsRef.current === 0 ? "error" : "saving");
        setStorageError(getErrorMessage(error, "IndexedDBへの保存に失敗しました。"));
      });

    return run;
  }, []);

  const createTournament = useCallback(() => {
    const tournament = createDefaultTournament();
    setTournaments((current) => [tournament, ...current]);
    void enqueuePersistence(() => repository.save(tournament));
    return tournament;
  }, [enqueuePersistence, repository]);

  const updateTournament = useCallback((tournament: Tournament) => {
    const current = tournaments.find((item) => item.id === tournament.id);

    if (current && !hasTournamentContentChanged(current, tournament)) {
      return;
    }

    const next = touchTournament(tournament);
    setTournaments((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists
        ? current.map((item) => item.id === next.id ? next : item)
        : [next, ...current];
    });
    void enqueuePersistence(() => repository.save(next));
  }, [enqueuePersistence, repository, tournaments]);

  const deleteTournament = useCallback((id: string) => {
    setTournaments((current) => current.filter((item) => item.id !== id));
    void enqueuePersistence(() => repository.delete(id));
  }, [enqueuePersistence, repository]);

  const duplicateTournament = useCallback(async (id: string) => {
    try {
      const duplicated = await enqueuePersistence(() => repository.duplicate(id));
      setTournaments((current) => [duplicated, ...current]);
      return duplicated;
    } catch {
      return undefined;
    }
  }, [enqueuePersistence, repository]);

  const importTournament = useCallback((tournament: Tournament) => {
    setTournaments((current) => [tournament, ...current]);
    void enqueuePersistence(() => repository.save(tournament));
  }, [enqueuePersistence, repository]);

  const replaceAllTournaments = useCallback(async (replacement: readonly Tournament[]) => {
    const next = [...replacement];
    await enqueuePersistence(() => repository.replaceAll(next));
    setTournaments(next);
  }, [enqueuePersistence, repository]);

  const value = useMemo<TournamentContextValue>(
    () => ({
      tournaments,
      storageStatus,
      storageError,
      createTournament,
      updateTournament,
      deleteTournament,
      duplicateTournament,
      importTournament,
      replaceAllTournaments,
    }),
    [
      createTournament,
      deleteTournament,
      duplicateTournament,
      importTournament,
      replaceAllTournaments,
      storageError,
      storageStatus,
      tournaments,
      updateTournament,
    ],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournaments(): TournamentContextValue {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error("useTournaments must be used inside TournamentProvider.");
  }
  return context;
}

export function useTournament(id: string | undefined): Tournament | undefined {
  const { tournaments } = useTournaments();
  return tournaments.find((tournament) => tournament.id === id);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
