import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Tournament } from "../domain/types";
import { loadTournaments, saveTournaments } from "./tournamentPersistence";
import { createDefaultTournament, touchTournament } from "./tournamentModel";

type TournamentContextValue = {
  tournaments: Tournament[];
  createTournament: () => Tournament;
  updateTournament: (tournament: Tournament) => void;
  deleteTournament: (id: string) => void;
  duplicateTournament: (id: string) => Tournament | undefined;
  importTournament: (tournament: Tournament) => void;
};

const TournamentContext = createContext<TournamentContextValue | undefined>(undefined);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => loadTournaments());

  useEffect(() => {
    saveTournaments(tournaments);
  }, [tournaments]);

  const createTournament = useCallback(() => {
    const tournament = createDefaultTournament();
    setTournaments((current) => [tournament, ...current]);
    return tournament;
  }, []);

  const updateTournament = useCallback((tournament: Tournament) => {
    const next = touchTournament(tournament);
    setTournaments((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists
        ? current.map((item) => item.id === next.id ? next : item)
        : [next, ...current];
    });
  }, []);

  const deleteTournament = useCallback((id: string) => {
    setTournaments((current) => current.filter((item) => item.id !== id));
  }, []);

  const duplicateTournament = useCallback((id: string) => {
    let duplicated: Tournament | undefined;

    setTournaments((current) => {
      const source = current.find((item) => item.id === id);

      if (!source) {
        return current;
      }

      const now = new Date().toISOString();
      duplicated = {
        ...source,
        id: `tournament-${crypto.randomUUID()}`,
        title: `${source.title || "無題のトーナメント"} のコピー`,
        generatedDraw: undefined,
        createdAt: now,
        updatedAt: now,
      };

      return duplicated ? [duplicated, ...current] : current;
    });

    return duplicated;
  }, []);

  const importTournament = useCallback((tournament: Tournament) => {
    setTournaments((current) => [touchTournament(tournament), ...current]);
  }, []);

  const value = useMemo<TournamentContextValue>(
    () => ({
      tournaments,
      createTournament,
      updateTournament,
      deleteTournament,
      duplicateTournament,
      importTournament,
    }),
    [createTournament, deleteTournament, duplicateTournament, importTournament, tournaments, updateTournament],
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
