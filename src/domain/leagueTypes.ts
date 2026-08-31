export type LeagueParticipantType = "individual" | "doubles" | "team";
export type LeagueStatus = "draft" | "scheduled" | "inProgress" | "completed";
export type MatchSelectionStatus = "pending" | "confirmed";
export type LeagueSelectionMode = "all" | "random" | "manual";
export type LeagueMatchResult =
  | "unplayed"
  | "participantAWin"
  | "draw"
  | "participantBWin";

export type LeagueParticipant = {
  id: string;
  displayName: string;
  participantType: LeagueParticipantType;
  memberNames: string[];
  team?: string;
  region?: string;
  note?: string;
  selectionStatus: "selected" | "reserve" | "excluded";
};

export type LeagueSelection = {
  mode: LeagueSelectionMode;
  randomSeed?: string;
  selectedParticipantIds: string[];
  reserveParticipantIds: string[];
};

export type LeagueGroup = {
  id: string;
  name: string;
  participantIds: string[];
};

export type LeagueScoringPolicy = {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
};

export type LeagueMatch = {
  id: string;
  groupId: string;
  order: number;
  participantAId: string;
  participantBId: string;
  isValid: boolean;
  result: LeagueMatchResult;
  note?: string;
};

export type LeagueStanding = {
  groupId: string;
  participantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  manualRank?: number;
  rankStatus: "unconfirmed" | "confirmed";
};

export type League = {
  id: string;
  title: string;
  date?: string;
  venue?: string;
  eventName?: string;
  participantType: LeagueParticipantType;
  capacity: number;
  participants: LeagueParticipant[];
  selection: LeagueSelection;
  groups: LeagueGroup[];
  scoringPolicy: LeagueScoringPolicy;
  matches: LeagueMatch[];
  standings: LeagueStanding[];
  status: LeagueStatus;
  matchSelectionStatus: MatchSelectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type LeagueValidationIssue = {
  code: string;
  message: string;
  participantId?: string;
  groupId?: string;
  field?: string;
};

export type LeagueValidationResult = {
  errors: LeagueValidationIssue[];
  warnings: LeagueValidationIssue[];
};

