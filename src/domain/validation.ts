import type { DrawOptions, DrawSize, Entrant, MatchType, Tournament, ValidationIssue, ValidationResult } from "./types";
import { VALID_DRAW_SIZES } from "./types";

const DEFAULT_OPTIONS: DrawOptions = {
  avoidSameTeam: true,
  avoidSameRegion: true,
  prioritizeSeedBye: true,
};

export function normalizeTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    id: normalizeOptionalString(tournament.id) ?? "tournament-1",
    title: normalizeOptionalString(tournament.title),
    date: normalizeOptionalString(tournament.date),
    venue: normalizeOptionalString(tournament.venue),
    eventName: normalizeOptionalString(tournament.eventName),
    seedCount: normalizeNumber(tournament.seedCount) ?? 0,
    entrants: normalizeEntrants(tournament.entrants ?? [], tournament.matchType),
    options: {
      ...DEFAULT_OPTIONS,
      ...(tournament.options ?? {}),
      randomSeed: normalizeOptionalString(tournament.options?.randomSeed),
    },
    createdAt: normalizeOptionalString(tournament.createdAt) ?? "",
    updatedAt: normalizeOptionalString(tournament.updatedAt) ?? "",
  };
}

export function normalizeEntrants(entrants: Entrant[], matchType: MatchType): Entrant[] {
  return entrants.map((entrant, index) => ({
    ...entrant,
    id: normalizeOptionalString(entrant.id) ?? `entrant-${index + 1}`,
    seedNo: normalizeSeedNo(entrant.seedNo),
    player1Name: normalizeRequiredString(entrant.player1Name),
    player2Name: normalizeOptionalString(entrant.player2Name),
    team1: normalizeOptionalString(entrant.team1),
    team2: matchType === "doubles" ? normalizeOptionalString(entrant.team2) : undefined,
    sameTeam: entrant.sameTeam ?? false,
    region: normalizeOptionalString(entrant.region),
  }));
}

export function validateTournament(tournament: Tournament): ValidationResult {
  const normalized = normalizeTournament(tournament);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isMatchType(normalized.matchType)) {
    errors.push({
      code: "MATCH_TYPE_REQUIRED",
      message: "種目区分を選択してください",
      field: "matchType",
    });
  }

  if (normalized.drawSize === undefined || normalized.drawSize === null) {
    errors.push({
      code: "DRAW_SIZE_REQUIRED",
      message: "ドローサイズを選択してください",
      field: "drawSize",
    });
  } else if (!isDrawSize(normalized.drawSize)) {
    errors.push({
      code: "INVALID_DRAW_SIZE",
      message: "ドローサイズが不正です",
      field: "drawSize",
    });
  }

  if (isDrawSize(normalized.drawSize) && normalized.seedCount > normalized.drawSize) {
    errors.push({
      code: "SEED_COUNT_EXCEEDS_DRAW_SIZE",
      message: "シード数はドローサイズ以下にしてください",
      field: "seedCount",
    });
  }

  const matchType = isMatchType(normalized.matchType) ? normalized.matchType : "singles";
  const validEntrants = getValidEntrants(normalized.entrants, matchType);

  for (const entrant of normalized.entrants) {
    if (matchType === "singles" && !entrant.player1Name) {
      errors.push({
        code: "PLAYER_NAME_REQUIRED",
        message: "選手名を入力してください",
        entrantId: entrant.id,
        field: "player1Name",
      });
    }

    if (hasSeedValue(entrant) && getNumericSeedNo(entrant) === undefined) {
      errors.push({
        code: "SEED_NO_INVALID",
        message: "シード番号は数値で入力してください",
        entrantId: entrant.id,
        field: "seedNo",
      });
    }

    if (isDrawSize(normalized.drawSize)) {
      const seedNo = getNumericSeedNo(entrant);

      if (seedNo !== undefined && seedNo > normalized.drawSize) {
        errors.push({
          code: "SEED_NO_INVALID",
          message: "シード番号は数値で入力してください",
          entrantId: entrant.id,
          field: "seedNo",
        });
      }
    }

    if (matchType === "doubles") {
      const hasPlayer1 = Boolean(entrant.player1Name);
      const hasPlayer2 = Boolean(entrant.player2Name);

      if (hasPlayer1 !== hasPlayer2) {
        warnings.push({
          code: "DOUBLES_PLAYER_MISSING",
          message: "ダブルスの選手名が片方のみ入力されています",
          entrantId: entrant.id,
          field: hasPlayer1 ? "player2Name" : "player1Name",
        });
      }
    }
  }

  if (validEntrants.length === 0) {
    errors.push({
      code: "NO_ENTRANTS",
      message: "参加者を1件以上入力してください",
      field: "entrants",
    });
  }

  if (isDrawSize(normalized.drawSize) && validEntrants.length > normalized.drawSize) {
    errors.push({
      code: "ENTRANTS_EXCEED_DRAW_SIZE",
      message: "参加者数がドローサイズを超えています",
      field: "entrants",
    });
  }

  warnings.push(...findDuplicatePlayerWarnings(normalized.entrants));
  warnings.push(...findSeedWarnings(validEntrants, normalized.seedCount));

  return { errors, warnings };
}

export function getValidEntrants(entrants: readonly Entrant[], matchType: MatchType): Entrant[] {
  return entrants.filter((entrant) => {
    if (matchType === "doubles") {
      return Boolean(entrant.player1Name || entrant.player2Name);
    }

    return Boolean(entrant.player1Name);
  });
}

export function getNumericSeedNo(entrant: Entrant): number | undefined {
  if (typeof entrant.seedNo !== "number") {
    return undefined;
  }

  if (!Number.isInteger(entrant.seedNo) || entrant.seedNo < 1) {
    return undefined;
  }

  return entrant.seedNo;
}

export function isDrawSize(value: unknown): value is DrawSize {
  return typeof value === "number" && VALID_DRAW_SIZES.includes(value as DrawSize);
}

function findDuplicatePlayerWarnings(entrants: readonly Entrant[]): ValidationIssue[] {
  const names = new Map<string, { entrantId: string; field: string }[]>();

  for (const entrant of entrants) {
    addName(names, entrant.player1Name, entrant.id, "player1Name");
    addName(names, entrant.player2Name, entrant.id, "player2Name");
  }

  const warnings: ValidationIssue[] = [];

  for (const entries of names.values()) {
    if (entries.length > 1) {
      warnings.push({
        code: "DUPLICATE_PLAYER_NAME",
        message: "同じ選手名が複数行にあります",
        entrantId: entries[0].entrantId,
        field: entries[0].field,
      });
    }
  }

  return warnings;
}

function findSeedWarnings(entrants: readonly Entrant[], seedCount: number): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const seedCounts = new Map<number, number>();
  let assignedSeedCount = 0;

  for (const entrant of entrants) {
    const seedNo = getNumericSeedNo(entrant);

    if (seedNo === undefined) {
      continue;
    }

    assignedSeedCount += 1;
    seedCounts.set(seedNo, (seedCounts.get(seedNo) ?? 0) + 1);
  }

  if ([...seedCounts.values()].some((count) => count > 1)) {
    warnings.push({
      code: "UNUSUAL_SEED_DUPLICATION",
      message: "シード番号の重複があります",
      field: "seedNo",
    });
  }

  if ((seedCount > 0 || assignedSeedCount > 0) && seedCount !== assignedSeedCount) {
    warnings.push({
      code: "SEED_COUNT_MISMATCH",
      message: "シード数とシード指定人数が一致していません",
      field: "seedCount",
    });
  }

  return warnings;
}

function addName(
  names: Map<string, { entrantId: string; field: string }[]>,
  value: string | undefined,
  entrantId: string,
  field: string,
): void {
  if (!value) {
    return;
  }

  const key = value.toLocaleLowerCase();
  names.set(key, [...(names.get(key) ?? []), { entrantId, field }]);
}

function hasSeedValue(entrant: Entrant): boolean {
  return entrant.seedNo !== undefined && String(entrant.seedNo).trim() !== "";
}

function isMatchType(value: unknown): value is MatchType {
  return value === "singles" || value === "doubles";
}

function normalizeSeedNo(value: Entrant["seedNo"]): Entrant["seedNo"] {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function normalizeNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRequiredString(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
