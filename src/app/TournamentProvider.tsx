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
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";
import { initializeAppTournamentStorage } from "../storage/localStorageMigration";
import { getTournamentRepository } from "../storage/tournamentRepository";
import { getTournamentIntegrationRepository } from "../storage/tournamentIntegrationRepository";
import { cloneTournamentIntegration } from "./leagueTournamentAdapter";
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
  importTournament: (tournament: Tournament, integration?: TournamentIntegrationRecord) => void;
  replaceAllTournaments: (
    tournaments: readonly Tournament[],
    integrations?: readonly TournamentIntegrationRecord[],
  ) => Promise<void>;
  integrations: TournamentIntegrationRecord[];
  getTournamentIntegration: (tournamentId: string) => TournamentIntegrationRecord | undefined;
  updateTournamentWithIntegration: (tournament: Tournament, integration?: TournamentIntegrationRecord) => void;
  updateTournamentIntegration: (integration: TournamentIntegrationRecord | undefined) => void;
};

const TournamentContext = createContext<TournamentContextValue | undefined>(undefined);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => getTournamentRepository(), []);
  const integrationRepository = useMemo(() => getTournamentIntegrationRepository(), []);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [integrations, setIntegrations] = useState<TournamentIntegrationRecord[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageError, setStorageError] = useState<string>();
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationsRef = useRef(0);
  const persistenceBatchFailedRef = useRef(false);

  useEffect(() => {
    let active = true;

    void Promise.all([initializeAppTournamentStorage(), integrationRepository.list()])
      .then(([loaded, loadedIntegrations]) => {
        if (!active) {
          return;
        }
        setTournaments(loaded);
        setIntegrations(loadedIntegrations);
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
  }, [integrationRepository]);

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
    setIntegrations((current) => current.filter((item) => item.tournamentId !== id));
    void enqueuePersistence(() => integrationRepository.deleteWithTournament(id));
  }, [enqueuePersistence, integrationRepository, repository]);

  const duplicateTournament = useCallback(async (id: string) => {
    try {
      const source = tournaments.find((item) => item.id === id);
      const sourceIntegration = integrations.find((item) => item.tournamentId === id);
      const duplicated = await enqueuePersistence(async () => {
        const next = await repository.duplicate(id);
        if (source && sourceIntegration) {
          const entrantIdMap = new Map(source.entrants.map((entrant, index) => [
            entrant.id,
            next.entrants[index]?.id ?? entrant.id,
          ]));
          await integrationRepository.save(cloneTournamentIntegration(sourceIntegration, next.id, entrantIdMap));
        }
        return next;
      });
      setTournaments((current) => [duplicated, ...current]);
      if (sourceIntegration && source) {
        const entrantIdMap = new Map(source.entrants.map((entrant, index) => [
          entrant.id,
          duplicated.entrants[index]?.id ?? entrant.id,
        ]));
        setIntegrations((current) => [
          cloneTournamentIntegration(sourceIntegration, duplicated.id, entrantIdMap),
          ...current,
        ]);
      }
      return duplicated;
    } catch {
      return undefined;
    }
  }, [enqueuePersistence, integrationRepository, integrations, repository, tournaments]);

  const importTournament = useCallback((tournament: Tournament, integration?: TournamentIntegrationRecord) => {
    setTournaments((current) => [tournament, ...current]);
    if (integration) {
      setIntegrations((current) => [integration, ...current]);
    }
    void enqueuePersistence(async () => {
      await integrationRepository.saveWithTournament(tournament, integration);
    });
  }, [enqueuePersistence, integrationRepository, repository]);

  const replaceAllTournaments = useCallback(async (
    replacement: readonly Tournament[],
    replacementIntegrations: readonly TournamentIntegrationRecord[] = [],
  ) => {
    const next = [...replacement];
    await enqueuePersistence(() => integrationRepository.replaceAllWithTournaments(next, replacementIntegrations));
    setTournaments(next);
    setIntegrations([...replacementIntegrations]);
  }, [enqueuePersistence, integrationRepository, repository]);

  const updateTournamentWithIntegration = useCallback((tournament: Tournament, integration?: TournamentIntegrationRecord) => {
    const next = touchTournament(tournament);
    setTournaments((current) => current.some((item) => item.id === next.id)
      ? current.map((item) => item.id === next.id ? next : item)
      : [next, ...current]);
    setIntegrations((current) => integration
      ? [integration, ...current.filter((item) => item.tournamentId !== integration.tournamentId)]
      : current.filter((item) => item.tournamentId !== next.id));
    void enqueuePersistence(async () => {
      await integrationRepository.saveWithTournament(next, integration);
    });
  }, [enqueuePersistence, integrationRepository, repository]);

  const updateTournamentIntegration = useCallback((integration: TournamentIntegrationRecord | undefined) => {
    if (!integration) {
      return;
    }
    const currentTournament = tournaments.find((item) => item.id === integration.tournamentId);
    const nextTournament = currentTournament?.generatedDraw
      ? touchTournament({ ...currentTournament, generatedDraw: undefined })
      : currentTournament;
    if (nextTournament && nextTournament !== currentTournament) {
      setTournaments((current) => current.map((item) => item.id === nextTournament.id ? nextTournament : item));
    }
    setIntegrations((current) => [integration, ...current.filter((item) => item.tournamentId !== integration.tournamentId)]);
    void enqueuePersistence(async () => {
      if (nextTournament && nextTournament !== currentTournament) {
        await integrationRepository.saveWithTournament(nextTournament, integration);
        return;
      }
      await integrationRepository.save(integration);
    });
  }, [enqueuePersistence, integrationRepository, repository, tournaments]);

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
      integrations,
      getTournamentIntegration: (tournamentId: string) => integrations.find((item) => item.tournamentId === tournamentId),
      updateTournamentWithIntegration,
      updateTournamentIntegration,
    }),
    [
      createTournament,
      deleteTournament,
      duplicateTournament,
      importTournament,
      integrations,
      replaceAllTournaments,
      storageError,
      storageStatus,
      tournaments,
      updateTournament,
      updateTournamentIntegration,
      updateTournamentWithIntegration,
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
