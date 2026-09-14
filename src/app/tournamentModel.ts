import { calculateByeCount } from "../domain/byePlacement";
import { generateDraw } from "../domain/drawGenerator";
import type {
  DrawSize,
  DrawOptions,
  DrawOutputOptions,
  Entrant,
  GeneratedDraw,
  MatchType,
  Tournament,
  TournamentMatchFormat,
  TournamentMatchSelectionStatus,
  ValidationIssue,
  ValidationResult,
} from "../domain/types";
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";
import { VALID_DRAW_SIZES, VALID_SEED_COUNTS } from "../domain/types";
import { DEFAULT_DRAW_OUTPUT_OPTIONS, getDrawOutputOptions } from "../domain/outputOptions";
import { createEmptySetScores, hasEnteredSetScore, normalizeSetScores } from "../domain/matchScoring";
import { getValidEntrants, isEntrantCompletelyEmpty, validateTournament } from "../domain/validation";
import { ensureTournamentMatches } from "../domain/tournamentMatches";
import { getLeagueTournamentScope, validateLeagueTournament } from "./leagueTournamentPlacement";

export const DRAW_SIZES: DrawSize[] = [...VALID_DRAW_SIZES];
export const SEED_COUNTS = [...VALID_SEED_COUNTS];
export const DEFAULT_MATCH_FORMAT: TournamentMatchFormat = 1;

export type GenerateTournamentResult = {
  tournament: Tournament;
  draw?: GeneratedDraw;
  validation: ValidationResult;
};

export function createDefaultTournament(): Tournament {
  const now = new Date().toISOString();

  return {
    id: createId("tournament"),
    title: "",
    date: "",
    venue: "",
    eventName: "",
    matchType: "singles",
    drawSize: 16,
    seedCount: 0,
    entrants: createEmptyEntrants(16, "singles"),
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
      seedPositionMode: "jtaRulebook",
      thirdFourthSeedPlacement: "tennisRule",
      fixByePositionOnSeedLottery: true,
      entrantPlacementOrder: "largeTeamFirst",
    },
    outputOptions: { ...DEFAULT_DRAW_OUTPUT_OPTIONS },
    matchFormat: DEFAULT_MATCH_FORMAT,
    detailInputEnabled: false,
    matchSelectionStatus: "pending",
    status: "inProgress",
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyEntrants(count: number, matchType: MatchType): Entrant[] {
  return Array.from({ length: count }, (_, index) => createEmptyEntrant(index + 1, matchType));
}

export function ensureEntrantRows(
  entrants: readonly Entrant[],
  drawSize: DrawSize,
  matchType: MatchType,
): Entrant[] {
  if (entrants.length >= drawSize) {
    return [...entrants];
  }

  return [
    ...entrants,
    ...Array.from(
      { length: drawSize - entrants.length },
      (_, index) => createEmptyEntrant(entrants.length + index + 1, matchType),
    ),
  ];
}

export function getVisibleEntrantRowCount(
  entrants: readonly Entrant[],
  drawSize: DrawSize,
): number {
  let lastEnteredRowIndex = -1;

  entrants.forEach((entrant, index) => {
    if (!isEntrantEmpty(entrant)) {
      lastEnteredRowIndex = index;
    }
  });

  return Math.max(drawSize, lastEnteredRowIndex + 1);
}

export function createEmptyEntrant(index: number, matchType: MatchType): Entrant {
  return {
    id: createId(`entrant-${index}`),
    player1Name: "",
    player2Name: matchType === "doubles" ? "" : undefined,
    teamName: matchType === "team" ? "" : undefined,
    memberNames: matchType === "team" ? [""] : undefined,
    team1: "",
    team2: matchType === "doubles" ? "" : undefined,
    sameTeam: false,
    sameTeamGroup: matchType === "doubles" ? "" : undefined,
    region: "",
    ranking: "",
  };
}

export function hasTournamentContentChanged(current: Tournament, next: Tournament): boolean {
  return JSON.stringify({ ...current, updatedAt: undefined })
    !== JSON.stringify({ ...next, updatedAt: undefined });
}

export function touchTournament(
  tournament: Tournament,
  updatedAt = new Date().toISOString(),
): Tournament {
  return {
    ...tournament,
    updatedAt,
  };
}

export function hasTournamentMatchData(tournament: Tournament): boolean {
  return tournament.generatedDraw?.matches?.some(
    (match) => match.result !== "unplayed"
      || Boolean(match.note?.trim())
      || hasEnteredSetScore(match.setScores),
  ) ?? false;
}

export function getTournamentMatchFormat(tournament: Tournament): TournamentMatchFormat {
  return tournament.matchFormat === 3 || tournament.matchFormat === 5
    ? tournament.matchFormat
    : DEFAULT_MATCH_FORMAT;
}

export function getTournamentMatchSelectionStatus(tournament: Tournament): TournamentMatchSelectionStatus {
  if (tournament.matchSelectionStatus === "pending") {
    return "pending";
  }

  // A generated draw predates this field in legacy JSON. Treat it as confirmed
  // so existing tournaments remain able to accept results after import.
  return tournament.generatedDraw ? "confirmed" : "pending";
}

export function getTournamentCompletionErrors(tournament: Tournament): ValidationIssue[] {
  if (!tournament.generatedDraw) {
    return [{
      code: "TOURNAMENT_DRAW_REQUIRED",
      message: "トーナメント表を生成してから完了してください。",
    }];
  }

  if (getTournamentMatchSelectionStatus(tournament) !== "confirmed") {
    return [{
      code: "TOURNAMENT_MATCH_SELECTION_REQUIRED",
      message: "対戦カードを確定してからトーナメントを完了してください。",
    }];
  }

  return [];
}

export function canCompleteTournament(tournament: Tournament): boolean {
  return getTournamentCompletionErrors(tournament).length === 0;
}

export function completeTournament(tournament: Tournament): Tournament {
  if (!canCompleteTournament(tournament)) {
    return tournament;
  }

  return { ...tournament, status: "completed" };
}

export function reopenTournament(tournament: Tournament): Tournament {
  if (tournament.status !== "completed") {
    return tournament;
  }

  return { ...tournament, status: "inProgress" };
}

export function compactTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    entrants: tournament.entrants.filter((entrant) => !isEntrantEmpty(entrant)),
  };
}

export function mergeEntrantsIntoEmptyRows(
  currentEntrants: readonly Entrant[],
  incomingEntrants: readonly Entrant[],
): Entrant[] {
  const remaining = [...incomingEntrants];
  const merged = currentEntrants.map((entrant) => {
    if (!isEntrantEmpty(entrant) || remaining.length === 0) {
      return entrant;
    }

    return remaining.shift()!;
  });

  return [...merged, ...remaining];
}

export function applyBasicInfoPatch(
  tournament: Tournament,
  patch: Partial<Tournament>,
  integration?: TournamentIntegrationRecord,
): Tournament {
  if (getTournamentMatchSelectionStatus(tournament) === "confirmed") {
    return {
      ...tournament,
      title: patch.title ?? tournament.title,
      date: patch.date ?? tournament.date,
      venue: patch.venue ?? tournament.venue,
      eventName: patch.eventName ?? tournament.eventName,
    };
  }
  const baseline = withGenerationInputSignature(tournament, integration);
  return refreshGeneratedDrawAfterChange(baseline, { ...baseline, ...patch }, integration);
}

export function applyEntrantsUpdate(
  tournament: Tournament,
  entrants: Entrant[],
  integration?: TournamentIntegrationRecord,
): Tournament {
  if (getTournamentMatchSelectionStatus(tournament) === "confirmed") {
    return tournament;
  }
  const baseline = withGenerationInputSignature(tournament, integration);
  return refreshGeneratedDrawAfterChange(baseline, { ...baseline, entrants }, integration);
}

export function applyOptionsPatch(
  tournament: Tournament,
  patch: Partial<DrawOptions>,
  integration?: TournamentIntegrationRecord,
): Tournament {
  if (getTournamentMatchSelectionStatus(tournament) === "confirmed") {
    return tournament;
  }
  const baseline = withGenerationInputSignature(tournament, integration);
  return refreshGeneratedDrawAfterChange(baseline, {
    ...baseline,
    options: { ...baseline.options, ...patch },
  }, integration);
}

export function updateTournamentMatchFormat(
  tournament: Tournament,
  matchFormat: TournamentMatchFormat,
): Tournament {
  if (
    tournament.status === "completed"
    || getTournamentMatchSelectionStatus(tournament) === "confirmed"
  ) {
    return tournament;
  }

  const normalizedFormat = matchFormat === 3 || matchFormat === 5 ? matchFormat : DEFAULT_MATCH_FORMAT;
  return {
    ...tournament,
    matchFormat: normalizedFormat,
    generatedDraw: tournament.generatedDraw ? {
      ...tournament.generatedDraw,
      matches: ensureTournamentMatches(tournament.generatedDraw, tournament.drawSize, normalizedFormat).map((match) => ({
        ...match,
        setScores: normalizeSetScores(match.setScores, normalizedFormat),
      })),
    } : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function markTournamentMatchSelectionConfirmed(tournament: Tournament): Tournament {
  if (!tournament.generatedDraw || tournament.status === "completed") {
    return tournament;
  }

  return {
    ...tournament,
    matchSelectionStatus: "confirmed",
    updatedAt: new Date().toISOString(),
  };
}

export function unconfirmTournamentMatchSelection(tournament: Tournament): Tournament {
  if (
    !tournament.generatedDraw
    || tournament.status === "completed"
    || getTournamentMatchSelectionStatus(tournament) !== "confirmed"
  ) {
    return tournament;
  }

  const matchFormat = getTournamentMatchFormat(tournament);
  return {
    ...tournament,
    matchSelectionStatus: "pending",
    generatedDraw: {
      ...tournament.generatedDraw,
      matches: ensureTournamentMatches(tournament.generatedDraw, tournament.drawSize, matchFormat).map((match) => ({
        ...match,
        result: "unplayed",
        isWalkover: false,
        setScores: createEmptySetScores(matchFormat),
        note: undefined,
      })),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function updateTournamentDetailInputEnabled(
  tournament: Tournament,
  enabled: boolean,
): Tournament {
  if (
    tournament.status === "completed"
    || getTournamentMatchSelectionStatus(tournament) !== "confirmed"
  ) {
    return tournament;
  }

  const matchFormat = getTournamentMatchFormat(tournament);
  return {
    ...tournament,
    detailInputEnabled: enabled,
    generatedDraw: enabled || !tournament.generatedDraw ? tournament.generatedDraw : {
      ...tournament.generatedDraw,
      matches: ensureTournamentMatches(tournament.generatedDraw, tournament.drawSize, matchFormat).map((match) => ({
        ...match,
        setScores: createEmptySetScores(matchFormat),
      })),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function applyOutputOptionsPatch(
  tournament: Tournament,
  patch: Partial<DrawOutputOptions>,
  integration?: TournamentIntegrationRecord,
): Tournament {
  const baseline = withGenerationInputSignature(tournament, integration);

  return {
    ...baseline,
    outputOptions: getDrawOutputOptions({ ...baseline.outputOptions, ...patch }),
  };
}

export function createGenerationInputSignature(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): string {
  return JSON.stringify({
    version: 1,
    matchType: tournament.matchType,
    drawSize: tournament.drawSize,
    seedCount: tournament.seedCount,
    entrants: toEntrantDrawSignature(tournament.entrants),
    options: toDrawOptionsSignature(tournament.options),
    integration: integration ? {
      source: integration.source,
      sourceGroupCount: integration.sourceGroupCount,
      sourceGroupSizes: integration.sourceGroupSizes,
      rankRange: integration.rankRange,
      participants: integration.participants.map((participant) => ({
        tournamentEntrantId: participant.tournamentEntrantId,
        groupKey: participant.groupKey,
        groupLabel: participant.groupLabel,
        rank: participant.rank,
        rankOrigin: participant.rankOrigin,
      })),
    } : undefined,
  });
}

export function isTournamentDrawCurrent(tournament: Tournament, integration?: TournamentIntegrationRecord): boolean {
  const generatedDraw = tournament.generatedDraw;

  if (!generatedDraw) {
    return false;
  }

  return generatedDraw.generationInputSignature === undefined
    || generatedDraw.generationInputSignature === createGenerationInputSignature(tournament, integration);
}

export function validateTournamentForUi(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): ValidationResult {
  const validation = integration ? validateLeagueTournament(tournament, integration) : validateTournament(tournament);

  return {
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function generateTournamentDraw(
  tournament: Tournament,
  seedOverride?: string,
  integration?: TournamentIntegrationRecord,
): GenerateTournamentResult {
  const now = new Date().toISOString();
  const validation = integration ? validateLeagueTournament(tournament, integration) : validateTournament(tournament);

  if (validation.errors.length > 0) {
    return {
      tournament,
      validation,
    };
  }

  const randomSeed = seedOverride ?? tournament.options.randomSeed ?? createRandomSeed();
  const scope = integration ? getLeagueTournamentScope(tournament, integration) : undefined;
  const result = generateDraw({
    tournament: scope?.tournament ?? tournament,
    randomSeed,
    now,
    // The match format affects score rows, not the draw placement itself.
    // Keep the tournament setting on the generated match model.
    placementContext: scope?.placementContext,
  });

  if (!result.draw) {
    return {
      tournament,
      validation: result.validation,
    };
  }

  const generatedTournament = {
    ...tournament,
    options: {
      ...tournament.options,
      randomSeed,
    },
  };
  const generatedDraw = {
    ...result.draw,
    generationInputSignature: createGenerationInputSignature(generatedTournament, integration),
  };

  return {
    tournament: {
      ...generatedTournament,
      generatedDraw,
      matchSelectionStatus: "pending",
      detailInputEnabled: false,
      updatedAt: now,
    },
    draw: generatedDraw,
    validation: result.validation,
  };
}

export function getEntrantStats(tournament: Tournament, integration?: TournamentIntegrationRecord): {
  activeEntrantCount: number;
  hasEntrantOverflow: boolean;
  byeCount: number | undefined;
  seedAssignedCount: number;
  seedAssignmentStatus: "matched" | "shortage" | "excess";
} {
  const compact = compactTournament(tournament);
  const scopedEntrants = integration
    ? getLeagueTournamentScope(compact, integration).eligibleEntrants
    : getValidEntrants(compact.entrants, compact.matchType);
  const activeEntrantCount = scopedEntrants.length;
  const hasEntrantOverflow = activeEntrantCount > compact.drawSize;
  const seedAssignedCount = scopedEntrants.filter(
    (entrant) => entrant.seedNo !== undefined && String(entrant.seedNo).trim() !== "",
  ).length;
  const seedAssignmentStatus = seedAssignedCount < compact.seedCount
    ? "shortage"
    : seedAssignedCount > compact.seedCount
      ? "excess"
      : "matched";

  return {
    activeEntrantCount,
    hasEntrantOverflow,
    byeCount: hasEntrantOverflow ? undefined : calculateByeCount(compact.drawSize, activeEntrantCount),
    seedAssignedCount,
    seedAssignmentStatus,
  };
}

export function isEntrantEmpty(entrant: Entrant): boolean {
  return isEntrantCompletelyEmpty(entrant);
}

function withGenerationInputSignature(tournament: Tournament, integration?: TournamentIntegrationRecord): Tournament {
  if (!tournament.generatedDraw) {
    return tournament;
  }

  const randomSeed = tournament.options.randomSeed?.trim() || tournament.generatedDraw.randomSeed;
  const normalizedTournament = tournament.options.randomSeed === randomSeed
    ? tournament
    : {
        ...tournament,
        options: {
          ...tournament.options,
          randomSeed,
        },
      };

  if (
    tournament.generatedDraw.generationInputSignature !== undefined
    && normalizedTournament === tournament
    && tournament.generatedDraw.generationInputSignature === createGenerationInputSignature(normalizedTournament, integration)
  ) {
    return tournament;
  }

  return {
    ...normalizedTournament,
    generatedDraw: {
      ...tournament.generatedDraw,
      generationInputSignature: createGenerationInputSignature(normalizedTournament, integration),
    },
  };
}

function refreshGeneratedDrawAfterChange(
  previous: Tournament,
  next: Tournament,
  integration?: TournamentIntegrationRecord,
): Tournament {
  const generatedDraw = previous.generatedDraw;
  const seed = next.options.randomSeed?.trim()
    || generatedDraw?.randomSeed
    || previous.options.randomSeed?.trim();

  if (!seed) {
    return next;
  }

  const candidate = next.options.randomSeed === seed
    ? next
    : {
        ...next,
        options: {
          ...next.options,
          randomSeed: seed,
        },
      };

  if (generatedDraw?.generationInputSignature === createGenerationInputSignature(candidate, integration)) {
    return candidate;
  }

  const result = generateTournamentDraw(candidate, seed, integration);

  if (!result.draw) {
    return {
      ...candidate,
      generatedDraw: undefined,
    };
  }

  return result.tournament;
}

function toEntrantDrawSignature(entrants: readonly Entrant[]) {
  return entrants
    .filter((entrant) => !isEntrantEmpty(entrant))
    .map((entrant) => ({
      id: entrant.id,
      seedNo: normalizeSignatureValue(entrant.seedNo),
      player1Name: normalizeSignatureValue(entrant.player1Name),
      player2Name: normalizeSignatureValue(entrant.player2Name),
      teamName: normalizeSignatureValue(entrant.teamName),
      memberNames: (entrant.memberNames ?? []).map((memberName) => memberName.trim()),
      team1: normalizeSignatureValue(entrant.team1),
      team2: normalizeSignatureValue(entrant.team2),
      sameTeam: entrant.sameTeam === true,
      sameTeamGroup: normalizeSignatureValue(entrant.sameTeamGroup),
      region: normalizeSignatureValue(entrant.region),
      ranking: normalizeSignatureValue(entrant.ranking),
    }));
}

function toDrawOptionsSignature(options: DrawOptions) {
  return {
    avoidSameTeam: options.avoidSameTeam,
    avoidSameRegion: options.avoidSameRegion,
    prioritizeSeedBye: options.prioritizeSeedBye,
    seedPositionMode: options.seedPositionMode ?? "jtaRulebook",
    thirdFourthSeedPlacement: options.thirdFourthSeedPlacement ?? "tennisRule",
    fixByePositionOnSeedLottery: options.fixByePositionOnSeedLottery ?? true,
    entrantPlacementOrder: options.entrantPlacementOrder ?? "largeTeamFirst",
    randomSeed: normalizeSignatureValue(options.randomSeed),
  };
}

function normalizeSignatureValue(value: number | string | undefined): string {
  return value === undefined ? "" : String(value).trim();
}

export function parseEntrantsFromText(text: string, matchType: MatchType): Entrant[] {
  const rows = parseDelimitedRows(text).filter((row) => row.some((cell) => cell.trim()));

  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows[0] ?? [];
  const hasHeader = firstRow.some((cell) => getHeaderField(cell) !== undefined);
  const headers = hasHeader ? firstRow.map(getHeaderField) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const hasLeadingNumberColumn = detectLeadingNumberColumn(dataRows);

  return dataRows.map((row, index) => {
    const entrant = createEmptyEntrant(index + 1, matchType);

    if (hasHeader) {
      row.forEach((cell, cellIndex) => {
        const field = headers[cellIndex];
        assignEntrantField(entrant, field, cell);
      });
    } else {
      assignByVisibleColumnOrder(entrant, row, matchType, index, hasLeadingNumberColumn);
    }

    entrant.id = createId(`entrant-${index + 1}`);
    return entrant;
  });
}

export function createRandomSeed(): string {
  return `seed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDelimitedRows(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => parseDelimitedLine(line, line.includes("\t") ? "\t" : ","));
}

function parseDelimitedLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function getHeaderField(header: string): keyof Entrant | "no" | undefined {
  const normalized = header.trim().toLowerCase();

  if (["no", "no.", "番号", "行番号"].includes(normalized)) {
    return "no";
  }

  if (["seed", "seed no", "seedno", "シード", "シード番号"].includes(normalized)) {
    return "seedNo";
  }

  if (["player name", "player", "name", "選手名", "選手", "player1", "player1name", "選手名1"].includes(normalized)) {
    return "player1Name";
  }

  if (["player2", "player2name", "partner", "選手名2", "ペア2", "ペア"].includes(normalized)) {
    return "player2Name";
  }

  if (["team name", "teamname", "チーム名"].includes(normalized)) {
    return "teamName";
  }

  if (["members", "member names", "membernames", "メンバー", "メンバー（/区切り）"].includes(normalized)) {
    return "memberNames";
  }

  if (["affiliation", "team", "team1", "所属", "所属チーム", "所属チーム1"].includes(normalized)) {
    return "team1";
  }

  if (["team2", "所属チーム2"].includes(normalized)) {
    return "team2";
  }

  if (["same team", "sameteam", "same team group", "sameteamgroup", "同チーム", "同チーム扱い"].includes(normalized)) {
    return "sameTeamGroup";
  }

  if (["region", "area", "district", "地区", "地域"].includes(normalized)) {
    return "region";
  }

  if (["ranking", "rank", "順位", "ランキング"].includes(normalized)) {
    return "ranking";
  }

  return undefined;
}

function assignByVisibleColumnOrder(
  entrant: Entrant,
  row: string[],
  matchType: MatchType,
  rowIndex: number,
  hasLeadingNumberColumn: boolean,
): void {
  const values = stripLeadingNumberColumn(row, rowIndex, hasLeadingNumberColumn);

  if (matchType === "doubles") {
    const fields = inferDoublesFields(values);

    values.forEach((cell, index) => assignEntrantField(entrant, fields[index], cell));
    return;
  }

  if (matchType === "team") {
    const fields = inferTeamFields(values);

    values.forEach((cell, index) => assignEntrantField(entrant, fields[index], cell));
    return;
  }

  const fields = inferSinglesFields(values);

  values.forEach((cell, index) => assignEntrantField(entrant, fields[index], cell));
}

function stripLeadingNumberColumn(row: string[], rowIndex: number, hasLeadingNumberColumn: boolean): string[] {
  if (!hasLeadingNumberColumn && !isRowNumberCell(row[0], rowIndex + 1)) {
    return row;
  }

  return row.slice(1);
}

function inferSinglesFields(values: string[]): (keyof Entrant)[] {
  if (values.length >= 5 || hasSeedColumn(values)) {
    return ["seedNo", "player1Name", "team1", "region", "ranking"];
  }

  return ["player1Name", "team1", "region", "ranking"];
}

function inferDoublesFields(values: string[]): (keyof Entrant)[] {
  if (values.length >= 8 || hasSeedColumn(values)) {
    return ["seedNo", "player1Name", "player2Name", "team1", "team2", "sameTeamGroup", "region", "ranking"];
  }

  if (values.length >= 7) {
    return ["player1Name", "player2Name", "team1", "team2", "sameTeamGroup", "region", "ranking"];
  }

  return ["player1Name", "player2Name", "team1", "team2", "region", "ranking"];
}

function inferTeamFields(values: string[]): (keyof Entrant)[] {
  if (values.length >= 6 || hasSeedColumn(values)) {
    return ["seedNo", "teamName", "memberNames", "team1", "region", "ranking"];
  }

  return ["teamName", "memberNames", "team1", "region", "ranking"];
}

function hasSeedColumn(values: readonly string[]): boolean {
  if (values.length < 2) {
    return false;
  }

  const first = values[0]?.trim() ?? "";
  return first === "" || Number.isInteger(Number(first));
}

function detectLeadingNumberColumn(rows: readonly string[][]): boolean {
  if (rows.length < 2) {
    return false;
  }

  const numbers = rows.map((row) => parsePositiveInteger(row[0]));

  if (numbers.some((number) => number === undefined)) {
    return false;
  }

  const first = numbers[0] ?? 0;
  return numbers.every((number, index) => number === first + index);
}

function isRowNumberCell(value: string | undefined, expectedNumber: number): boolean {
  return parsePositiveInteger(value) === expectedNumber;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function assignEntrantField(entrant: Entrant, field: keyof Entrant | "no" | undefined, value: string): void {
  if (!field || field === "id" || field === "no") {
    return;
  }

  if (field === "sameTeam") {
    entrant.sameTeam = ["true", "1", "yes", "y", "同じ", "同一", "○", "on"].includes(value.trim().toLowerCase());
    return;
  }

  if (field === "sameTeamGroup") {
    entrant.sameTeamGroup = value.trim();
    return;
  }

  if (field === "memberNames") {
    entrant.memberNames = value.split("/").map((memberName) => memberName.trim()).filter(Boolean);
    return;
  }

  if (field === "seedNo" || field === "ranking") {
    entrant[field] = normalizeNumberishText(value);
    return;
  }

  entrant[field] = value.trim();
}

function normalizeNumberishText(value: string): number | string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}
