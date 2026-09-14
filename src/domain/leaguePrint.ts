import { getSetCount, type League, type LeagueMatch, type LeagueParticipant } from "./leagueTypes";
import { calculateAutomaticRanks, getEffectiveLeagueRank } from "./leagueLogic";

export const LEAGUE_PRINT_MAX_PARTICIPANTS = 16;
export const LEAGUE_PRINT_COLUMNS_PER_PAGE = 8;

export type LeaguePrintBuildError =
  | "group-not-found"
  | "empty-group"
  | "participant-not-found"
  | "too-many-participants";

export type LeaguePrintResultMode = "current" | "blank";

export type LeagueMatrixPrintParticipant = {
  id: string;
  displayName: string;
  fullLabel: string;
  rank?: number;
};

export type LeagueMatrixPrintCell = {
  participantId: string;
  isDiagonal: boolean;
  result?: string;
  details?: string[];
};

export type LeagueMatrixPrintRow = {
  participant: LeagueMatrixPrintParticipant;
  cells: LeagueMatrixPrintCell[];
};

export type LeagueMatrixPrintPage = {
  groupId: string;
  groupName: string;
  pageNumber: number;
  pageCount: number;
  columns: LeagueMatrixPrintParticipant[];
  rows: LeagueMatrixPrintRow[];
};

export type LeagueMatrixPrintPagesResult = {
  pages: LeagueMatrixPrintPage[];
  error?: LeaguePrintBuildError;
};

export function buildLeagueMatrixPrintPages(
  league: League,
  groupId: string,
  resultMode: LeaguePrintResultMode = league.status === "completed" ? "current" : "blank",
): LeagueMatrixPrintPagesResult {
  const group = league.groups.find((item) => item.id === groupId);
  if (!group) return { pages: [], error: "group-not-found" };

  const participantsById = new Map(league.participants.map((participant) => [participant.id, participant]));
  const participants: LeagueParticipant[] = [];

  for (const participantId of group.participantIds) {
    const participant = participantsById.get(participantId);
    if (!participant) return { pages: [], error: "participant-not-found" };
    participants.push(participant);
  }

  participants.sort((left, right) => {
    const leftIndex = league.participants.indexOf(left);
    const rightIndex = league.participants.indexOf(right);
    return leftIndex - rightIndex;
  });

  if (participants.length === 0) return { pages: [], error: "empty-group" };
  if (participants.length > LEAGUE_PRINT_MAX_PARTICIPANTS) {
    return { pages: [], error: "too-many-participants" };
  }

  const automaticRanks = resultMode === "current"
    ? calculateAutomaticRanks(league.groups, league.standings, league.matches)
    : new Map<string, number>();
  const standingsByParticipantId = new Map(league.standings.map((standing) => [standing.participantId, standing]));
  const printParticipants = participants.map((participant) => {
    const standing = standingsByParticipantId.get(participant.id);
    const rank = resultMode === "current" && standing ? getEffectiveLeagueRank(standing, automaticRanks) : undefined;
    return toPrintParticipant(participant, rank);
  });
  const columnGroups = chunk(printParticipants, LEAGUE_PRINT_COLUMNS_PER_PAGE);
  const showResults = resultMode === "current";
  const showDetails = showResults && league.detailDisplayEnabled;

  return {
    pages: columnGroups.map((columns, index) => ({
      groupId: group.id,
      groupName: group.name,
      pageNumber: index + 1,
      pageCount: columnGroups.length,
      columns,
      rows: printParticipants.map((participant) => ({
        participant,
        cells: columns.map((column) => createPrintCell(league, participant.id, column.id, showResults, showDetails)),
      })),
    })),
  };
}

function createPrintCell(league: League, rowId: string, columnId: string, showResults: boolean, showDetails: boolean): LeagueMatrixPrintCell {
  const isDiagonal = rowId === columnId;
  const cell: LeagueMatrixPrintCell = { participantId: columnId, isDiagonal };
  if (isDiagonal || !showResults) return cell;

  const match = league.matches.find((item) => (item.participantAId === rowId && item.participantBId === columnId) || (item.participantAId === columnId && item.participantBId === rowId));
  cell.result = getMatrixResult(match, rowId);
  if (showDetails) {
    cell.details = match?.isWalkover
      ? ["WO"]
      : Array.from({ length: getSetCount(league.matchFormat) }, (_, setIndex) => getMatrixScore(match, rowId, setIndex));
  }
  return cell;
}

function getMatrixResult(match: LeagueMatch | undefined, rowId: string): string {
  if (!match || !match.isValid) return "-";
  if (match.result === "unplayed") return "未";
  if (match.result === "draw") return "△";
  if (match.result === "participantAWin") return match.participantAId === rowId ? "○" : "●";
  return match.participantAId === rowId ? "●" : "○";
}

function getMatrixScore(match: LeagueMatch | undefined, rowId: string, setIndex: number): string {
  if (!match || !match.isValid || match.result === "unplayed") return "-";
  const score = match.setScores?.[setIndex];
  if (!score || score.participantA === null || score.participantB === null) return "-";
  return match.participantAId === rowId ? `${score.participantA}-${score.participantB}` : `${score.participantB}-${score.participantA}`;
}

function toPrintParticipant(participant: LeagueParticipant, rank: number | undefined): LeagueMatrixPrintParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName || "名称未設定",
    fullLabel: getParticipantLabel(participant),
    ...(rank === undefined ? {} : { rank }),
  };
}

function getParticipantLabel(participant: LeagueParticipant): string {
  const displayName = participant.displayName || "名称未設定";
  const members = participant.memberNames.filter(Boolean).join(" / ");
  return members && participant.participantType !== "individual"
    ? `${displayName}\n${members}`
    : displayName;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
