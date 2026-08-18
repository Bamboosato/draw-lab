export const VALID_DRAW_SIZES = [4, 8, 16, 32, 64, 128] as const;
export const VALID_SEED_COUNTS = [0, 2, 4, 8, 16, 32, 64] as const;

export type DrawSize = (typeof VALID_DRAW_SIZES)[number];
export type MatchType = "singles" | "doubles";

export type Entrant = {
  id: string;
  seedNo?: number | string;
  player1Name: string;
  player2Name?: string;
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
  generatedAt: string;
  generationInputSignature?: string;
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
};

export type PlacementPenaltyParams = {
  entrant: Entrant;
  candidatePosition: number;
  slots: DrawSlot[];
  entrantsById: Map<string, Entrant>;
  drawSize: DrawSize;
  options: DrawOptions;
};

export type CreateGeneratedDrawParams = {
  tournamentId: string;
  randomSeed: string;
  slots: DrawSlot[];
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
