import { calculateByeCount } from "../domain/byePlacement";
import { generateDraw } from "../domain/drawGenerator";
import type {
  DrawSize,
  DrawOptions,
  Entrant,
  GeneratedDraw,
  MatchType,
  Tournament,
  ValidationResult,
} from "../domain/types";
import { VALID_DRAW_SIZES, VALID_SEED_COUNTS } from "../domain/types";
import { getValidEntrants, validateTournament } from "../domain/validation";

export const DRAW_SIZES: DrawSize[] = [...VALID_DRAW_SIZES];
export const SEED_COUNTS = [...VALID_SEED_COUNTS];

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

export function createEmptyEntrant(index: number, matchType: MatchType): Entrant {
  return {
    id: createId(`entrant-${index}`),
    player1Name: "",
    player2Name: matchType === "doubles" ? "" : undefined,
    team1: "",
    team2: matchType === "doubles" ? "" : undefined,
    sameTeam: false,
    sameTeamGroup: matchType === "doubles" ? "" : undefined,
    region: "",
    ranking: "",
  };
}

export function touchTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    updatedAt: new Date().toISOString(),
  };
}

export function compactTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    entrants: tournament.entrants.filter((entrant) => !isEntrantEmpty(entrant)),
  };
}

export function applyBasicInfoPatch(tournament: Tournament, patch: Partial<Tournament>): Tournament {
  const next = { ...tournament, ...patch };

  if (hasGenerationBasicInfoChanged(tournament, next)) {
    return { ...next, generatedDraw: undefined };
  }

  return next;
}

export function applyEntrantsUpdate(tournament: Tournament, entrants: Entrant[]): Tournament {
  const next = { ...tournament, entrants };

  if (haveDrawEntrantsChanged(tournament.entrants, entrants)) {
    return { ...next, generatedDraw: undefined };
  }

  return next;
}

export function applyOptionsPatch(tournament: Tournament, patch: Partial<DrawOptions>): Tournament {
  const options = { ...tournament.options, ...patch };
  const next = { ...tournament, options };

  if (areDrawOptionsEqual(tournament.options, options)) {
    return next;
  }

  return { ...next, generatedDraw: undefined };
}

export function validateTournamentForUi(tournament: Tournament): ValidationResult {
  const validation = validateTournament(tournament);

  return {
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function generateTournamentDraw(tournament: Tournament, seedOverride?: string): GenerateTournamentResult {
  const now = new Date().toISOString();
  const validation = validateTournament(tournament);

  if (validation.errors.length > 0) {
    return {
      tournament,
      validation,
    };
  }

  const compact = compactTournament(tournament);
  const randomSeed = seedOverride ?? compact.options.randomSeed ?? createRandomSeed();
  const result = generateDraw({
    tournament: compact,
    randomSeed,
    now,
  });

  if (!result.draw) {
    return {
      tournament: compact,
      validation: result.validation,
    };
  }

  return {
    tournament: {
      ...compact,
      generatedDraw: result.draw,
      updatedAt: now,
    },
    draw: result.draw,
    validation: result.validation,
  };
}

export function getEntrantStats(tournament: Tournament): {
  activeEntrantCount: number;
  byeCount: number | undefined;
  seedAssignedCount: number;
} {
  const compact = compactTournament(tournament);
  const activeEntrantCount = getValidEntrants(compact.entrants, compact.matchType).length;

  return {
    activeEntrantCount,
    byeCount: activeEntrantCount <= compact.drawSize ? calculateByeCount(compact.drawSize, activeEntrantCount) : undefined,
    seedAssignedCount: compact.entrants.filter((entrant) => entrant.seedNo !== undefined && String(entrant.seedNo).trim() !== "").length,
  };
}

export function isEntrantEmpty(entrant: Entrant): boolean {
  return [
    entrant.seedNo,
    entrant.player1Name,
    entrant.player2Name,
    entrant.team1,
    entrant.team2,
    entrant.sameTeamGroup,
    entrant.region,
    entrant.ranking,
  ].every((value) => value === undefined || String(value).trim() === "") && entrant.sameTeam !== true;
}

function hasGenerationBasicInfoChanged(current: Tournament, next: Tournament): boolean {
  return current.matchType !== next.matchType
    || current.drawSize !== next.drawSize
    || current.seedCount !== next.seedCount;
}

function haveDrawEntrantsChanged(current: readonly Entrant[], next: readonly Entrant[]): boolean {
  return JSON.stringify(toEntrantDrawSignature(current)) !== JSON.stringify(toEntrantDrawSignature(next));
}

function areDrawOptionsEqual(current: DrawOptions, next: DrawOptions): boolean {
  return JSON.stringify(toDrawOptionsSignature(current)) === JSON.stringify(toDrawOptionsSignature(next));
}

function toEntrantDrawSignature(entrants: readonly Entrant[]) {
  return entrants
    .filter((entrant) => !isEntrantEmpty(entrant))
    .map((entrant) => ({
      id: entrant.id,
      seedNo: normalizeSignatureValue(entrant.seedNo),
      player1Name: normalizeSignatureValue(entrant.player1Name),
      player2Name: normalizeSignatureValue(entrant.player2Name),
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
    seedPositionMode: options.seedPositionMode,
    thirdFourthSeedPlacement: options.thirdFourthSeedPlacement,
    fixByePositionOnSeedLottery: options.fixByePositionOnSeedLottery,
    entrantPlacementOrder: options.entrantPlacementOrder,
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
