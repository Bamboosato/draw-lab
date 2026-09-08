export type LeagueParticipantType = "individual" | "doubles" | "team";
export type LeagueStatus = "draft" | "scheduled" | "inProgress" | "completed";
export type MatchSelectionStatus = "pending" | "confirmed";
export type LeagueSelectionMode = "all" | "random" | "manual";
export type LeagueMatchResult =
  | "unplayed"
  | "participantAWin"
  | "draw"
  | "participantBWin";

export type MatchFormat = 1 | 3 | 5;

export type LeagueSetScore = {
  participantA: number | null;
  participantB: number | null;
};

export function getSetCount(matchFormat: MatchFormat | undefined): number {
  return matchFormat === 3 || matchFormat === 5 ? matchFormat : 1;
}

export function createEmptySetScores(matchFormat: MatchFormat | undefined): LeagueSetScore[] {
  return Array.from({ length: getSetCount(matchFormat) }, () => ({ participantA: null, participantB: null }));
}

export function normalizeSetScores(value: unknown, matchFormat: MatchFormat | undefined): LeagueSetScore[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: getSetCount(matchFormat) }, (_, index) => {
    const item = source[index];
    if (!item || typeof item !== "object") return { participantA: null, participantB: null };
    const score = item as Partial<LeagueSetScore>;
    return {
      participantA: normalizeScore(score.participantA),
      participantB: normalizeScore(score.participantB),
    };
  });
}

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

function normalizeScore(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

