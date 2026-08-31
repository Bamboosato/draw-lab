import type { League, LeagueParticipant } from "./leagueTypes";

export const LEAGUE_PRINT_MAX_PARTICIPANTS = 16;
export const LEAGUE_PRINT_COLUMNS_PER_PAGE = 8;

export type LeaguePrintBuildError =
  | "group-not-found"
  | "empty-group"
  | "participant-not-found"
  | "too-many-participants";

export type LeagueMatrixPrintParticipant = {
  id: string;
  displayName: string;
  fullLabel: string;
};

export type LeagueMatrixPrintCell = {
  participantId: string;
  isDiagonal: boolean;
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

  const printParticipants = participants.map(toPrintParticipant);
  const columnGroups = chunk(printParticipants, LEAGUE_PRINT_COLUMNS_PER_PAGE);

  return {
    pages: columnGroups.map((columns, index) => ({
      groupId: group.id,
      groupName: group.name,
      pageNumber: index + 1,
      pageCount: columnGroups.length,
      columns,
      rows: printParticipants.map((participant) => ({
        participant,
        cells: columns.map((column) => ({
          participantId: column.id,
          isDiagonal: participant.id === column.id,
        })),
      })),
    })),
  };
}

function toPrintParticipant(participant: LeagueParticipant): LeagueMatrixPrintParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName || "名称未設定",
    fullLabel: getParticipantLabel(participant),
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
