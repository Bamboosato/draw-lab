import type { DrawOptions, DrawSize, Entrant, MatchType, Tournament, ValidationIssue, ValidationResult } from "./types";
import { normalizeSameTeamGroup } from "./teamGrouping";
import { VALID_DRAW_SIZES, VALID_SEED_COUNTS } from "./types";

const DEFAULT_OPTIONS: DrawOptions = {
  avoidSameTeam: true,
  avoidSameRegion: true,
  prioritizeSeedBye: true,
  seedPositionMode: "jtaRulebook",
  thirdFourthSeedPlacement: "tennisRule",
  fixByePositionOnSeedLottery: true,
  entrantPlacementOrder: "largeTeamFirst",
};

export function normalizeTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    id: normalizeOptionalString(tournament.id) ?? "tournament-1",
    title: normalizeOptionalString(tournament.title),
    date: normalizeOptionalString(tournament.date),
    venue: normalizeOptionalString(tournament.venue),
    eventName: normalizeOptionalString(tournament.eventName),
    seedCount: normalizeNumber(tournament.seedCount) ?? Number.NaN,
    entrants: normalizeEntrants(tournament.entrants ?? [], tournament.matchType),
    options: {
      ...DEFAULT_OPTIONS,
      ...(tournament.options ?? {}),
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
      seedPositionMode: normalizeSeedPositionMode(tournament.options?.seedPositionMode),
      thirdFourthSeedPlacement: normalizeThirdFourthSeedPlacement(tournament.options?.thirdFourthSeedPlacement),
      fixByePositionOnSeedLottery: tournament.options?.fixByePositionOnSeedLottery ?? DEFAULT_OPTIONS.fixByePositionOnSeedLottery,
      entrantPlacementOrder: normalizeEntrantPlacementOrder(tournament.options?.entrantPlacementOrder),
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
    sameTeamGroup: matchType === "doubles" ? normalizeSameTeamGroup(entrant.sameTeamGroup) : undefined,
    region: normalizeOptionalString(entrant.region),
  }));
}

export function isEntrantCompletelyEmpty(entrant: Entrant): boolean {
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

  const seedCount = getNumericSeedCount(normalized.seedCount);

  if (seedCount === undefined) {
    errors.push({
      code: "SEED_COUNT_INVALID",
      message: "シード数は0以上の整数で入力してください",
      field: "seedCount",
    });
  } else {
    if (isDrawSize(normalized.drawSize) && seedCount > normalized.drawSize) {
      errors.push({
        code: "SEED_COUNT_EXCEEDS_DRAW_SIZE",
        message: "シード数はドローサイズ以下にしてください",
        field: "seedCount",
      });
    }

    if (!isSupportedSeedCount(seedCount)) {
      errors.push({
        code: "SEED_COUNT_UNSUPPORTED",
        message: "シード数は0, 2, 4, 8, 16, 32, 64から選択してください",
        field: "seedCount",
      });
    }
  }

  const matchType = isMatchType(normalized.matchType) ? normalized.matchType : "singles";
  const entrantsToValidate = normalized.entrants.filter((entrant) => !isEntrantCompletelyEmpty(entrant));
  const validEntrants = getValidEntrants(entrantsToValidate, matchType);

  for (const entrant of entrantsToValidate) {
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

    if (hasRankingValue(entrant) && getNumericRanking(entrant) === undefined) {
      errors.push({
        code: "RANKING_INVALID",
        message: "ランキングは1〜9999の整数で入力してください",
        entrantId: entrant.id,
        field: "ranking",
      });
    }

    const seedNo = getNumericSeedNo(entrant);

    if (seedNo !== undefined) {
      if (seedCount !== undefined && seedNo > seedCount) {
        errors.push({
          code: "SEED_NO_EXCEEDS_SEED_COUNT",
          message: "シード番号はシード数以内で指定してください",
          entrantId: entrant.id,
          field: "seedNo",
        });
      } else if (isDrawSize(normalized.drawSize) && seedNo > normalized.drawSize) {
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

      if (entrant.sameTeamGroup && Array.from(entrant.sameTeamGroup).length > 5) {
        errors.push({
          code: "SAME_TEAM_GROUP_TOO_LONG",
          message: "同チーム扱いは1〜5文字で入力してください",
          entrantId: entrant.id,
          field: "sameTeamGroup",
        });
      }

      if (!hasPlayer1 || !hasPlayer2) {
        errors.push({
          code: "DOUBLES_PLAYER_MISSING",
          message: "ダブルスの選手名1・選手名2を入力してください",
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

  errors.push(...findSeedErrors(validEntrants, seedCount));
  warnings.push(...findDuplicatePlayerWarnings(entrantsToValidate));
  warnings.push(...findSeedWarnings(validEntrants));

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

export function getNumericRanking(entrant: Entrant): number | undefined {
  if (typeof entrant.ranking === "number") {
    return Number.isInteger(entrant.ranking) && entrant.ranking >= 1 && entrant.ranking <= 9999
      ? entrant.ranking
      : undefined;
  }

  if (typeof entrant.ranking !== "string") {
    return undefined;
  }

  const trimmed = entrant.ranking.trim();

  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : undefined;
}

export function getNumericSeedCount(seedCount: number): number | undefined {
  if (!Number.isInteger(seedCount) || seedCount < 0) {
    return undefined;
  }

  return seedCount;
}

export function isDrawSize(value: unknown): value is DrawSize {
  return typeof value === "number" && VALID_DRAW_SIZES.includes(value as DrawSize);
}

export function isSupportedSeedCount(seedCount: number): boolean {
  return VALID_SEED_COUNTS.includes(seedCount as (typeof VALID_SEED_COUNTS)[number]);
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

function findSeedErrors(entrants: readonly Entrant[], seedCount: number | undefined): ValidationIssue[] {
  if (seedCount === undefined) {
    return [];
  }

  const errors: ValidationIssue[] = [];
  const seedCounts = countSeeds(entrants);
  const bandCounts = new Map<string, { band: { start: number; end: number }; count: number }>();

  for (const [seedNo, count] of seedCounts) {
    if (seedNo > seedCount) {
      continue;
    }

    const band = getSeedBand(seedNo, seedCount);

    if (band) {
      const key = `${band.start}-${band.end}`;
      const current = bandCounts.get(key);
      bandCounts.set(key, {
        band,
        count: (current?.count ?? 0) + count,
      });
    }
  }

  for (const { band, count } of bandCounts.values()) {
    if (count > band.end - band.start + 1) {
      errors.push({
        code: "SEED_DUPLICATION_EXCEEDS_PLACEMENT_SLOTS",
        message: "同順位シードが配置枠数を超えています",
        field: "seedNo",
      });
    }
  }

  const assignedSeedCount = Array.from(seedCounts.values()).reduce((sum, count) => sum + count, 0);

  if ((seedCount > 0 || assignedSeedCount > 0) && seedCount !== assignedSeedCount) {
    errors.push({
      code: "SEED_COUNT_MISMATCH",
      message: "シード数とシード指定人数が一致していません",
      field: "seedCount",
    });
  }

  return errors;
}

function findSeedWarnings(entrants: readonly Entrant[]): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const seedCounts = countSeeds(entrants);

  if ([...seedCounts.values()].some((count) => count > 1)) {
    warnings.push({
      code: "UNUSUAL_SEED_DUPLICATION",
      message: "シード番号の重複があります",
      field: "seedNo",
    });
  }

  return warnings;
}

function countSeeds(entrants: readonly Entrant[]): Map<number, number> {
  const seedCounts = new Map<number, number>();

  for (const entrant of entrants) {
    const seedNo = getNumericSeedNo(entrant);

    if (seedNo !== undefined) {
      seedCounts.set(seedNo, (seedCounts.get(seedNo) ?? 0) + 1);
    }
  }

  return seedCounts;
}

function getSeedBand(seedNo: number, seedCount: number): { start: number; end: number } | undefined {
  let start = 1;
  let size = 1;

  while (start <= seedCount) {
    const end = Math.min(seedCount, start + size - 1);

    if (seedNo >= start && seedNo <= end) {
      return { start, end };
    }

    start = end + 1;
    size = start === 2 ? 1 : size * 2;
  }

  return undefined;
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

function hasRankingValue(entrant: Entrant): boolean {
  return entrant.ranking !== undefined && String(entrant.ranking).trim() !== "";
}

function isMatchType(value: unknown): value is MatchType {
  return value === "singles" || value === "doubles";
}

function normalizeSeedPositionMode(value: DrawOptions["seedPositionMode"]): DrawOptions["seedPositionMode"] {
  return value === "fixed" || value === "jtaRulebook" || value === "grandSlam" ? value : DEFAULT_OPTIONS.seedPositionMode;
}

function normalizeThirdFourthSeedPlacement(
  value: DrawOptions["thirdFourthSeedPlacement"],
): DrawOptions["thirdFourthSeedPlacement"] {
  return value === "tennisRule" || value === "standard" ? value : DEFAULT_OPTIONS.thirdFourthSeedPlacement;
}

function normalizeEntrantPlacementOrder(value: DrawOptions["entrantPlacementOrder"]): DrawOptions["entrantPlacementOrder"] {
  return value === "largeTeamFirst" || value === "random" || value === "rosterOrder"
    ? value
    : DEFAULT_OPTIONS.entrantPlacementOrder;
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
