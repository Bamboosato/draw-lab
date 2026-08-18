import type { Tournament } from "../domain/types";

export type TournamentSortKey = "date" | "updatedAt";
export type TournamentSortDirection = "asc" | "desc";

export type TournamentSort = {
  key: TournamentSortKey;
  direction: TournamentSortDirection;
};

export const DEFAULT_TOURNAMENT_SORT: TournamentSort = {
  key: "updatedAt",
  direction: "desc",
};

const INITIAL_DIRECTION: Record<TournamentSortKey, TournamentSortDirection> = {
  date: "asc",
  updatedAt: "desc",
};

export function getNextTournamentSort(
  current: TournamentSort,
  key: TournamentSortKey,
): TournamentSort {
  if (current.key !== key) {
    return { key, direction: INITIAL_DIRECTION[key] };
  }

  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortTournaments(
  tournaments: readonly Tournament[],
  sort: TournamentSort,
): Tournament[] {
  return tournaments
    .map((tournament, index) => ({ tournament, index }))
    .sort((left, right) => {
      const leftValue = getSortTimestamp(left.tournament, sort.key);
      const rightValue = getSortTimestamp(right.tournament, sort.key);

      if (leftValue === undefined && rightValue === undefined) {
        return left.index - right.index;
      }
      if (leftValue === undefined) {
        return 1;
      }
      if (rightValue === undefined) {
        return -1;
      }

      const comparison = leftValue - rightValue;
      if (comparison === 0) {
        return left.index - right.index;
      }

      return sort.direction === "asc" ? comparison : -comparison;
    })
    .map(({ tournament }) => tournament);
}

function getSortTimestamp(tournament: Tournament, key: TournamentSortKey): number | undefined {
  const value = key === "date" ? tournament.date : tournament.updatedAt;
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
