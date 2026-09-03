import type { Tournament } from "../domain/types";
import type { League } from "../domain/leagueTypes";
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";
import {
  getLeagueStatus,
  getLeagueStepCompletion,
  getLeagueStepPath,
} from "./leagueFlow";
import {
  getTournamentStepPath,
  isTournamentStepComplete,
} from "./tournamentFlow";
import { isTournamentDrawCurrent } from "./tournamentModel";

export const HOME_RECENT_ITEM_LIMIT = 5;

export type HomeRecentItemKind = "tournament" | "league";

export type HomeRecentItem = {
  kind: HomeRecentItemKind;
  id: string;
  title: string;
  date: string;
  status: string;
  updatedAt: string;
  resumePath: string;
};

export type HomeViewModel = {
  tournament: {
    total: number;
    generated: number;
    editing: number;
  };
  league: {
    total: number;
    editing: number;
    operating: number;
    completed: number;
  };
  recentItems: HomeRecentItem[];
};

export function buildHomeViewModel(
  tournaments: readonly Tournament[],
  leagues: readonly League[],
  integrations: readonly TournamentIntegrationRecord[] = [],
): HomeViewModel {
  const integrationByTournamentId = new Map(
    integrations.map((integration) => [integration.tournamentId, integration]),
  );
  const generatedTournamentCount = tournaments.filter((tournament) =>
    isTournamentDrawCurrent(tournament, integrationByTournamentId.get(tournament.id)),
  ).length;
  const leagueStatusCounts = leagues.reduce(
    (counts, league) => {
      counts[getLeagueStatus(league).category] += 1;
      return counts;
    },
    { editing: 0, operating: 0, completed: 0 },
  );
  const recentItems = [
    ...tournaments.map((tournament, inputIndex) => ({
      item: toTournamentRecentItem(tournament, integrationByTournamentId.get(tournament.id)),
      inputIndex,
    })),
    ...leagues.map((league, inputIndex) => ({
      item: toLeagueRecentItem(league),
      inputIndex: tournaments.length + inputIndex,
    })),
  ]
    .sort(compareRecentItems)
    .slice(0, HOME_RECENT_ITEM_LIMIT)
    .map(({ item }) => item);

  return {
    tournament: {
      total: tournaments.length,
      generated: generatedTournamentCount,
      editing: tournaments.length - generatedTournamentCount,
    },
    league: {
      total: leagues.length,
      editing: leagueStatusCounts.editing,
      operating: leagueStatusCounts.operating,
      completed: leagueStatusCounts.completed,
    },
    recentItems,
  };
}

export function getTournamentResumePath(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): string {
  if (!isTournamentStepComplete(tournament, "basic", integration)) {
    return getTournamentStepPath(tournament.id, "basic");
  }

  if (!isTournamentStepComplete(tournament, "entrants", integration)) {
    return getTournamentStepPath(tournament.id, "entrants");
  }

  return isTournamentDrawCurrent(tournament, integration)
    ? getTournamentStepPath(tournament.id, "preview")
    : getTournamentStepPath(tournament.id, "options");
}

export function getLeagueResumePath(league: League): string {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") {
    return getLeagueStepPath(league.id, "dashboard");
  }

  if (!getLeagueStepCompletion(league, "basic")) {
    return getLeagueStepPath(league.id, "basic");
  }

  if (!getLeagueStepCompletion(league, "participants")) {
    return getLeagueStepPath(league.id, "participants");
  }

  if (!getLeagueStepCompletion(league, "groups")) {
    return getLeagueStepPath(league.id, "groups");
  }

  if (!getLeagueStepCompletion(league, "matches")) {
    return getLeagueStepPath(league.id, "matches");
  }

  return getLeagueStepPath(league.id, "dashboard");
}

type SortableRecentItem = {
  item: HomeRecentItem;
  inputIndex: number;
};

function toTournamentRecentItem(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): HomeRecentItem {
  const drawCurrent = isTournamentDrawCurrent(tournament, integration);

  return {
    kind: "tournament",
    id: tournament.id,
    title: tournament.title?.trim() || "無題のトーナメント",
    date: tournament.date?.trim() || "未設定",
    status: drawCurrent ? "生成済" : "編集中",
    updatedAt: normalizeUpdatedAt(tournament.updatedAt),
    resumePath: getTournamentResumePath(tournament, integration),
  };
}

function toLeagueRecentItem(league: League): HomeRecentItem {
  return {
    kind: "league",
    id: league.id,
    title: league.title.trim() || "無題のリーグ",
    date: league.date?.trim() || "未設定",
    status: getLeagueStatus(league).label,
    updatedAt: normalizeUpdatedAt(league.updatedAt),
    resumePath: getLeagueResumePath(league),
  };
}

function compareRecentItems(left: SortableRecentItem, right: SortableRecentItem): number {
  const leftTimestamp = getTimestamp(left.item.updatedAt);
  const rightTimestamp = getTimestamp(right.item.updatedAt);

  if (leftTimestamp === undefined && rightTimestamp === undefined) {
    return left.inputIndex - right.inputIndex;
  }
  if (leftTimestamp === undefined) return 1;
  if (rightTimestamp === undefined) return -1;
  return rightTimestamp - leftTimestamp || left.inputIndex - right.inputIndex;
}

function normalizeUpdatedAt(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

function getTimestamp(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
