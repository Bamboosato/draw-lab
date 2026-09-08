import type { TournamentPlacementContext } from "./leagueTournamentTypes";

export const VALID_DRAW_SIZES = [4, 8, 16, 32, 64, 128] as const;
export const VALID_SEED_COUNTS = [0, 2, 4, 8, 16, 32, 64] as const;

export type DrawSize = (typeof VALID_DRAW_SIZES)[number];
export type MatchType = "singles" | "doubles" | "team";

export type Entrant = {
  id: string;
  seedNo?: number | string;
  player1Name: string;
  player2Name?: string;
  teamName?: string;
  memberNames?: string[];
  team1?: string;
  team2?: string;
  sameTeam?: boolean;
  sameTeamGroup?: string;
  region?: string;
  ranking?: number | string;
};

export type DrawOptions = {
  avoidSameTeam: boolean;
  avoidSameRegion: boolean;
  prioritizeSeedBye: boolean;
  seedPositionMode?: SeedPositionMode;
  thirdFourthSeedPlacement?: ThirdFourthSeedPlacement;
  fixByePositionOnSeedLottery?: boolean;
  entrantPlacementOrder?: EntrantPlacementOrder;
  randomSeed?: string;
};

export type DrawOutputOptions = {
  bracketLayout: "singleSide" | "bothSides";
  outputPageCount: OutputPageCount;
  rightSideDrawNumberPosition: "left" | "right";
  seedNumberPosition: "outer" | "inner";
  lineWeight: "thin" | "normal" | "bold" | "extraBold";
  teamNameBrackets: boolean;
  textAlign: "default" | "center" | "distributed";
};

export type OutputPageCount = 1 | 2 | 4 | 8 | 16 | 32;

export type SeedPositionMode = "fixed" | "jtaRulebook" | "grandSlam";
export type ThirdFourthSeedPlacement = "tennisRule" | "standard";
export type EntrantPlacementOrder = "largeTeamFirst" | "random" | "rosterOrder";
export type TournamentStatus = "inProgress" | "completed";
export type TournamentMatchSelectionStatus = "pending" | "confirmed";
export type TournamentMatchFormat = import("./matchScoring").MatchFormat;
export type TournamentSetScore = import("./matchScoring").SetScore;

export type Tournament = {
  id: string;
  title?: string;
  date?: string;
  venue?: string;
  eventName?: string;
  matchType: MatchType;
  drawSize: DrawSize;
  seedCount: number;
  entrants: Entrant[];
  options: DrawOptions;
  outputOptions?: DrawOutputOptions;
  generatedDraw?: GeneratedDraw;
  /** Added after the initial tournament flow; missing legacy data is normalized from the draw state. */
  matchFormat?: TournamentMatchFormat;
  /** Detailed game input is available only after the draw is confirmed. */
  detailInputEnabled?: boolean;
  /** Missing legacy data is treated as confirmed when a generated draw exists. */
  matchSelectionStatus?: TournamentMatchSelectionStatus;
  /** Optional for backwards compatibility with tournaments saved before completion status was added. */
  status?: TournamentStatus;
  createdAt: string;
  updatedAt: string;
};

export type DrawSlot = {
  position: number;
  entrantId?: string;
  isBye: boolean;
  seedNo?: number;
};

export type GeneratedDraw = {
  id: string;
  tournamentId: string;
  randomSeed: string;
  slots: DrawSlot[];
  matches: TournamentMatch[];
  generatedAt: string;
  generationInputSignature?: string;
};

export type TournamentMatchResult = "unplayed" | "participantAWin" | "participantBWin";

export type TournamentMatchSource =
  | { slotPosition: number }
  | { matchId: string };

export type TournamentMatch = {
  id: string;
  round: number;
  matchNo: number;
  sourceA: TournamentMatchSource;
  sourceB: TournamentMatchSource;
  result: TournamentMatchResult;
  /** Old JSON may omit scores; import normalization supplies empty rows. */
  setScores?: TournamentSetScore[];
  note?: string;
};

export type TournamentMatchState = "pending" | "ready" | "completed" | "byeAdvance";

export type ResolvedTournamentMatch = TournamentMatch & {
  state: TournamentMatchState;
  participantAId?: string;
  participantBId?: string;
  winnerEntrantId?: string;
};

export type ValidationResult = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type ValidationIssue = {
  code: string;
  message: string;
  entrantId?: string;
  field?: string;
};

export type GenerateDrawInput = {
  tournament: Tournament;
  randomSeed?: string;
  now: string;
  placementContext?: TournamentPlacementContext;
};

export type GenerateDrawResult = {
  draw?: GeneratedDraw;
  validation: ValidationResult;
};

export type PlaceSeededEntrantsParams = {
  slots: DrawSlot[];
  entrants: Entrant[];
  drawSize: DrawSize;
  seedCount: number;
  options: DrawOptions;
  seedPositionLookup?: number[];
  random: () => number;
};

export type PlaceByesParams = {
  slots: DrawSlot[];
  byeCount: number;
  drawSize: DrawSize;
  options: DrawOptions;
  seedPositionLookup?: number[];
  random: () => number;
};

export type PlaceUnseededEntrantsParams = {
  slots: DrawSlot[];
  entrants: Entrant[];
  entrantsById?: Map<string, Entrant>;
  drawSize: DrawSize;
  options: DrawOptions;
  random: () => number;
  placementContext?: TournamentPlacementContext;
};

export type PlacementPenaltyParams = {
  entrant: Entrant;
  candidatePosition: number;
  slots: DrawSlot[];
  entrantsById: Map<string, Entrant>;
  drawSize: DrawSize;
  options: DrawOptions;
  placementContext?: TournamentPlacementContext;
};

export type CreateGeneratedDrawParams = {
  tournamentId: string;
  randomSeed: string;
  slots: DrawSlot[];
  drawSize: DrawSize;
  matchFormat?: TournamentMatchFormat;
  now: string;
};

export type BracketViewModel = {
  title?: string;
  date?: string;
  venue?: string;
  eventName?: string;
  matchType: MatchType;
  drawSize: DrawSize;
  outputOptions: DrawOutputOptions;
  rows: BracketRow[];
  matches: ResolvedTournamentMatch[];
  championDrawPosition?: number;
};

export type BracketRow = {
  position: number;
  label: string;
  player1Label?: string;
  player2Label?: string;
  seedNo?: number;
  teamLabel?: string;
  team1Label?: string;
  team2Label?: string;
  isBye: boolean;
};
