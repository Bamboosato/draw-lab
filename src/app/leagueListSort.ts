import type { League } from "../domain/leagueTypes";

export type LeagueSortKey = "date" | "updatedAt";
export type LeagueSortDirection = "asc" | "desc";

export type LeagueSort = {
  key: LeagueSortKey;
  direction: LeagueSortDirection;
};

export const DEFAULT_LEAGUE_SORT: LeagueSort = {
  key: "updatedAt",
  direction: "desc",
};

const INITIAL_DIRECTION: Record<LeagueSortKey, LeagueSortDirection> = {
  date: "asc",
  updatedAt: "desc",
};

export function getNextLeagueSort(current: LeagueSort, key: LeagueSortKey): LeagueSort {
  if (current.key !== key) {
    return { key, direction: INITIAL_DIRECTION[key] };
  }

  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortLeagues(leagues: readonly League[], sort: LeagueSort): League[] {
  return leagues
    .map((league, index) => ({ league, index }))
    .sort((left, right) => {
      const leftValue = getSortTimestamp(left.league, sort.key);
      const rightValue = getSortTimestamp(right.league, sort.key);

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
    .map(({ league }) => league);
}

function getSortTimestamp(league: League, key: LeagueSortKey): number | undefined {
  const value = key === "date" ? league.date : league.updatedAt;
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
