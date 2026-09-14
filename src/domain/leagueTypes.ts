export type LeagueParticipantType = "individual" | "doubles" | "team";
import type { MatchFormat } from "./matchScoring";

export type LeagueStatus = "draft" | "scheduled" | "inProgress" | "completed";
export type MatchSelectionStatus = "pending" | "confirmed";
export type LeagueSelectionMode = "all" | "random" | "manual";
export type LeagueMatchResult =
  | "unplayed"
  | "participantAWin"
  | "draw"
  | "participantBWin";

export {
  createEmptySetScores,
  getSetCount,
  normalizeSetScores,
  type MatchFormat,
  type SetScore,
} from "./matchScoring";

export type LeagueSetScore = import("./matchScoring").SetScore;

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
  /** 旧保存データでは未保持の場合があるため、読込時に正規化する。 */
  setScores?: LeagueSetScore[];
  /** 不戦勝の記録。未保持は通常試合（false）として扱う。 */
  isWalkover?: boolean;
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
  /** 勝点・直接対決・スコア率・グループ内順から計算した自動順位。旧JSONでは未保持の場合がある。 */
  rank?: number;
  /** 旧来の手動順位欄。現在は訂正入力された順位として扱う。 */
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
  matchFormat: MatchFormat;
  detailInputEnabled: boolean;
  detailDisplayEnabled: boolean;
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
