import type { CompetitionBasicInfo, CommonParticipantUnit } from "./competitionTypes";
import type { MatchSelectionStatus, LeagueParticipantType } from "./leagueTypes";

export type RankRange = {
  min: number;
  max: number;
};

export type LeagueSourceRef = {
  leagueId: string;
  leagueUpdatedAt: string;
  matchSelectionStatus: MatchSelectionStatus;
};

export type LeagueParticipantPlacement = {
  sourceParticipantId: string;
  sourceGroupId?: string;
  sourceGroupName?: string;
  sourceGroupOrder?: number;
  rank?: number;
  rankOrigin?: "league" | "tournament-manual";
};

export type LeagueToTournamentSetup = {
  kind: "league-to-tournament";
  schemaVersion: 1;
  source: LeagueSourceRef;
  basicInfo: CompetitionBasicInfo;
  rankRange: RankRange;
  participants: Array<CommonParticipantUnit & { placement: LeagueParticipantPlacement }>;
};

export type TournamentIntegrationParticipant = {
  tournamentEntrantId: string;
  sourceParticipantId?: string;
  sourceGroupId?: string;
  sourceGroupName?: string;
  sourceGroupOrder?: number;
  groupKey?: string;
  groupLabel?: string;
  rank?: number;
  rankOrigin?: "league" | "tournament-manual";
};

export type TournamentIntegrationRecord = {
  tournamentId: string;
  kind: "league-to-tournament";
  schemaVersion: 1;
  source: LeagueSourceRef;
  sourceParticipantType: LeagueParticipantType;
  sourceGroupCount?: number;
  sourceGroupSizes?: number[];
  rankRange: RankRange;
  drawSizeMode?: "auto" | "manual";
  participants: TournamentIntegrationParticipant[];
  createdAt: string;
  updatedAt: string;
};

export type LeagueTournamentValidation = {
  errors: string[];
  warnings: string[];
};

export type TournamentPlacementContext = {
  rankRange: RankRange;
  participants: ReadonlyMap<string, TournamentIntegrationParticipant>;
  groupCount: number;
};
