import { calculateByeCount } from "../domain/byePlacement";
import { generateDraw } from "../domain/drawGenerator";
import type {
  DrawSize,
  Entrant,
  GeneratedDraw,
  MatchType,
  Tournament,
  ValidationIssue,
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
    entrants: createEmptyEntrants(8, "singles"),
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyEntrants(count: number, matchType: MatchType): Entrant[] {
  return Array.from({ length: count }, (_, index) => createEmptyEntrant(index + 1, matchType));
}

export function createEmptyEntrant(index: number, matchType: MatchType): Entrant {
  return {
    id: createId(`entrant-${index}`),
    player1Name: "",
    player2Name: matchType === "doubles" ? "" : undefined,
    team1: "",
    team2: matchType === "doubles" ? "" : undefined,
    sameTeam: false,
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

export function validateTournamentForUi(tournament: Tournament): ValidationResult {
  const compact = compactTournament(tournament);
  const validation = validateTournament(compact);
  const activeEntrants = getValidEntrants(compact.entrants, compact.matchType);

  return {
    errors: validation.errors,
    warnings: [...validation.warnings, ...buildOptionalAttributeWarnings(activeEntrants, compact.matchType)],
  };
}

export function generateTournamentDraw(tournament: Tournament, seedOverride?: string): GenerateTournamentResult {
  const now = new Date().toISOString();
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
    entrant.region,
    entrant.ranking,
  ].every((value) => value === undefined || String(value).trim() === "") && entrant.sameTeam !== true;
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

  return dataRows.map((row, index) => {
    const entrant = createEmptyEntrant(index + 1, matchType);

    if (hasHeader) {
      row.forEach((cell, cellIndex) => {
        const field = headers[cellIndex];
        assignEntrantField(entrant, field, cell);
      });
    } else {
      assignByVisibleColumnOrder(entrant, row, matchType);
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

function buildOptionalAttributeWarnings(entrants: readonly Entrant[], matchType: MatchType): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];

  for (const entrant of entrants) {
    const teamMissing = matchType === "doubles"
      ? !hasText(entrant.team1) && !hasText(entrant.team2)
      : !hasText(entrant.team1);

    if (teamMissing) {
      warnings.push({
        code: "TEAM_MISSING",
        message: "所属チームが未入力です。生成は可能ですが、偏り回避の精度が下がります",
        entrantId: entrant.id,
        field: "team1",
      });
    }

    if (!hasText(entrant.region)) {
      warnings.push({
        code: "REGION_MISSING",
        message: "地区が未入力です。生成は可能ですが、地区偏り回避の精度が下がります",
        entrantId: entrant.id,
        field: "region",
      });
    }

    if (entrant.ranking === undefined || String(entrant.ranking).trim() === "") {
      warnings.push({
        code: "RANKING_MISSING",
        message: "ランキングが未入力です。シード候補の確認情報としては任意です",
        entrantId: entrant.id,
        field: "ranking",
      });
    }
  }

  return warnings;
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

  if (["same team", "sameteam", "同チーム", "同チーム扱い"].includes(normalized)) {
    return "sameTeam";
  }

  if (["region", "area", "district", "地区", "地域"].includes(normalized)) {
    return "region";
  }

  if (["ranking", "rank", "順位", "ランキング"].includes(normalized)) {
    return "ranking";
  }

  return undefined;
}

function assignByVisibleColumnOrder(entrant: Entrant, row: string[], matchType: MatchType): void {
  if (matchType === "doubles") {
    const values = row.length >= 9 ? row.slice(1) : row;
    const fields: (keyof Entrant)[] = values.length >= 8
      ? ["seedNo", "player1Name", "player2Name", "team1", "team2", "sameTeam", "region", "ranking"]
      : ["player1Name", "player2Name", "team1", "team2", "region", "ranking"];

    values.forEach((cell, index) => assignEntrantField(entrant, fields[index], cell));
    return;
  }

  const values = row.length >= 6 ? row.slice(1) : row;
  const fields: (keyof Entrant)[] = values.length >= 5
    ? ["seedNo", "player1Name", "team1", "region", "ranking"]
    : ["player1Name", "team1", "region", "ranking"];

  values.forEach((cell, index) => assignEntrantField(entrant, fields[index], cell));
}

function assignEntrantField(entrant: Entrant, field: keyof Entrant | "no" | undefined, value: string): void {
  if (!field || field === "id" || field === "no") {
    return;
  }

  if (field === "sameTeam") {
    entrant.sameTeam = ["true", "1", "yes", "y", "同じ", "同一", "○", "on"].includes(value.trim().toLowerCase());
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

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}
