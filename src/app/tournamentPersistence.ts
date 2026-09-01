import type { DrawOptions, DrawSize, DrawSlot, Entrant, GeneratedDraw, Tournament } from "../domain/types";
import { normalizeDrawOutputOptions } from "../domain/outputOptions";
import { VALID_DRAW_SIZES } from "../domain/types";
import {
  createDefaultTournament,
  createGenerationInputSignature,
  createId,
  createRandomSeed,
  isTournamentDrawCurrent,
  touchTournament,
} from "./tournamentModel";

export const BACKUP_SCHEMA_VERSION = 1;

export type TournamentExport = {
  schemaVersion: 1;
  exportedAt: string;
  tournament: Tournament;
};

export type TournamentBackup = {
  schemaVersion: 1;
  exportedAt: string;
  tournaments: Tournament[];
};

export type ImportParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "success"; tournament: Tournament; message: string };

export type JsonImportParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; code: string; message: string }
  | { state: "success"; kind: "tournament"; tournament: Tournament; message: string }
  | { state: "success"; kind: "backup"; backup: TournamentBackup; message: string };

export function parseJsonImport(text: string, now = new Date().toISOString()): JsonImportParseResult {
  if (!text.trim()) {
    return {
      state: "empty",
      message: "大会情報を読み込むと読込結果が表示されます。未選択時はエラーを表示しません。",
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      state: "error",
      code: "JSON_PARSE_ERROR",
      message: "ファイルを読み込めません。大会情報ファイルを確認してください。",
    };
  }

  try {
    if (isRecord(parsed) && "tournaments" in parsed) {
      const backup = parseTournamentBackup(parsed);
      return {
        state: "success",
        kind: "backup",
        backup,
        message: `全大会バックアップです。大会${backup.tournaments.length}件を検出しました。`,
      };
    }

    if (
      isRecord(parsed)
      && "tournament" in parsed
      && parsed.schemaVersion !== undefined
      && parsed.schemaVersion !== BACKUP_SCHEMA_VERSION
    ) {
      throw new ImportDataError(
        "BACKUP_SCHEMA_UNSUPPORTED",
        "対応していない個別大会ファイルです。新しい形式で出力したファイルを選択してください。",
      );
    }

    const candidate = isRecord(parsed) && "tournament" in parsed ? parsed.tournament : parsed;
    if (!isTournamentLike(candidate)) {
      throw new ImportDataError("IMPORT_KIND_UNKNOWN", "対応していない大会情報ファイルです。");
    }
    const tournament = cloneImportedTournament(candidate, now);
    return {
      state: "success",
      kind: "tournament",
      tournament,
      message: `個別大会データです。参加者${tournament.entrants.length}件を検出しました。`,
    };
  } catch (error) {
    return {
      state: "error",
      code: error instanceof ImportDataError ? error.code : "IMPORT_INVALID_TOURNAMENT",
      message: error instanceof Error ? error.message : "大会情報を解析できません。",
    };
  }
}

export function parseTournamentImport(text: string): ImportParseResult {
  const result = parseJsonImport(text);

  if (result.state !== "success") {
    return result;
  }
  if (result.kind === "backup") {
    return {
      state: "error",
      message: "全大会バックアップです。大会情報の復元画面から全置換を実行してください。",
    };
  }

  return { state: "success", tournament: result.tournament, message: result.message };
}

export function serializeTournament(
  tournament: Tournament,
  exportedAt = new Date().toISOString(),
): string {
  const data: TournamentExport = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    tournament,
  };
  return JSON.stringify(data, null, 2);
}

export function serializeAllTournaments(
  tournaments: readonly Tournament[],
  exportedAt = new Date().toISOString(),
): string {
  const data: TournamentBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    tournaments: [...tournaments],
  };
  return JSON.stringify(data, null, 2);
}

export function downloadTournament(tournament: Tournament): void {
  const fileNameBase = sanitizeFileName(tournament.title || tournament.id);
  downloadJson(serializeTournament(tournament), `drawlab_${fileNameBase}.json`);
}

export function downloadAllTournaments(tournaments: readonly Tournament[]): void {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  downloadJson(serializeAllTournaments(tournaments), `drawlab_backup_${timestamp}.json`);
}

export function createSampleJson(): string {
  const tournament = touchTournament({
    ...createDefaultTournament(),
    title: "サンプルトーナメント",
    eventName: "男子シングルス",
    date: "2026-07-02",
    venue: "DrawLab Arena",
    seedCount: 4,
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
      seedPositionMode: "jtaRulebook",
      thirdFourthSeedPlacement: "tennisRule",
      fixByePositionOnSeedLottery: true,
      entrantPlacementOrder: "largeTeamFirst",
    },
    entrants: Array.from({ length: 8 }, (_, index) => ({
      id: createId(`sample-${index + 1}`),
      seedNo: index < 4 ? index + 1 : undefined,
      player1Name: `選手 ${index + 1}`,
      team1: `チーム ${Math.floor(index / 2) + 1}`,
      region: index % 2 === 0 ? "東地区" : "西地区",
      ranking: index + 1,
    })),
  });

  return serializeTournament(tournament);
}

export function coerceStoredTournament(value: unknown): Tournament {
  return coerceTournament(value);
}

export function cloneImportedTournament(value: unknown, now = new Date().toISOString()): Tournament {
  const source = coerceTournament(value);
  validateTournamentReferences(source, new Set<string>());
  const sourceDrawIsCurrent = isTournamentDrawCurrent(source);
  const tournamentId = createId("tournament");
  const entrantIdMap = new Map<string, string>();
  const entrants = source.entrants.map((entrant, index) => {
    const id = createId(`entrant-${index + 1}`);
    entrantIdMap.set(entrant.id, id);
    return { ...entrant, id };
  });

  const generatedDraw = source.generatedDraw
    ? {
        ...source.generatedDraw,
        id: createId("draw"),
        tournamentId,
        slots: source.generatedDraw.slots.map((slot) => {
          if (!slot.entrantId) {
            return { ...slot };
          }

          const entrantId = entrantIdMap.get(slot.entrantId);
          if (!entrantId) {
            throw new ImportDataError("IMPORT_REFERENCE_INVALID", "生成済みドローが存在しない参加者を参照しています。");
          }
          return { ...slot, entrantId };
        }),
      }
    : undefined;

  const tournament: Tournament = {
    ...source,
    id: tournamentId,
    entrants,
    generatedDraw,
    createdAt: now,
    updatedAt: now,
  };

  if (tournament.generatedDraw && sourceDrawIsCurrent) {
    tournament.generatedDraw = {
      ...tournament.generatedDraw,
      generationInputSignature: createGenerationInputSignature(tournament),
    };
  } else if (tournament.generatedDraw) {
    tournament.generatedDraw = undefined;
  }

  return tournament;
}

function parseTournamentBackup(value: Record<string, unknown>): TournamentBackup {
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new ImportDataError(
      "BACKUP_SCHEMA_UNSUPPORTED",
      "対応していないバックアップ形式です。schemaVersion 1 のJSONを選択してください。",
    );
  }
  if (typeof value.exportedAt !== "string" || !Array.isArray(value.tournaments)) {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "全大会バックアップに必要な項目が不足しています。");
  }

  const ids = new Set<string>();
  const tournaments = value.tournaments.map((item) => {
    validateStoredTournamentShape(item);
    const tournament = coerceTournament(item);
    validateTournamentReferences(tournament, ids);
    return tournament;
  });

  return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: value.exportedAt, tournaments };
}

function validateStoredTournamentShape(value: unknown): asserts value is Record<string, unknown> {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !value.id
    || !Array.isArray(value.entrants)
    || !isRecord(value.options)
    || (value.matchType !== "singles" && value.matchType !== "doubles" && value.matchType !== "team")
    || !VALID_DRAW_SIZES.includes(value.drawSize as DrawSize)
    || typeof value.seedCount !== "number"
    || !Number.isFinite(value.seedCount)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
  ) {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内の大会データに必要な項目が不足しています。");
  }

  for (const entrant of value.entrants) {
    if (
      !isRecord(entrant)
      || typeof entrant.id !== "string"
      || !entrant.id
      || (value.matchType === "team"
        ? typeof entrant.teamName !== "string"
          || !Array.isArray(entrant.memberNames)
          || entrant.memberNames.some((memberName) => typeof memberName !== "string")
        : typeof entrant.player1Name !== "string")
    ) {
      throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内の参加者IDが不正です。");
    }
  }

  if (value.generatedDraw !== undefined) {
    validateStoredDrawShape(value.generatedDraw);
  }
}

function validateStoredDrawShape(value: unknown): void {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !value.id
    || typeof value.tournamentId !== "string"
    || !value.tournamentId
    || typeof value.randomSeed !== "string"
    || typeof value.generatedAt !== "string"
    || (value.generationInputSignature !== undefined && typeof value.generationInputSignature !== "string")
    || !Array.isArray(value.slots)
    || value.slots.length === 0
  ) {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内の生成済みドローが不正です。");
  }

  const positions = new Set<number>();
  for (const slot of value.slots) {
    if (
      !isRecord(slot)
      || typeof slot.position !== "number"
      || !Number.isInteger(slot.position)
      || slot.position < 1
      || typeof slot.isBye !== "boolean"
      || (slot.entrantId !== undefined && typeof slot.entrantId !== "string")
      || positions.has(slot.position)
    ) {
      throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内のドロースロットが不正です。");
    }
    positions.add(slot.position);
  }
}

function validateTournamentReferences(tournament: Tournament, tournamentIds: Set<string>): void {
  registerId(tournamentIds, tournament.id, "大会");
  const entrantIds = new Set<string>();
  for (const entrant of tournament.entrants) {
    if (entrantIds.has(entrant.id)) {
      throw new ImportDataError("BACKUP_DUPLICATE_ID", `参加者ID「${entrant.id}」が重複しています。`);
    }
    entrantIds.add(entrant.id);
  }

  if (!tournament.generatedDraw) {
    return;
  }
  if (tournament.generatedDraw.tournamentId !== tournament.id) {
    throw new ImportDataError("BACKUP_REFERENCE_INVALID", "生成済みドローの大会ID参照が不正です。");
  }
  for (const slot of tournament.generatedDraw.slots) {
    if (slot.entrantId && !entrantIds.has(slot.entrantId)) {
      throw new ImportDataError("BACKUP_REFERENCE_INVALID", "生成済みドローが存在しない参加者を参照しています。");
    }
  }
}

function registerId(ids: Set<string>, id: string, label: string): void {
  if (!id || ids.has(id)) {
    throw new ImportDataError("BACKUP_DUPLICATE_ID", `${label}ID「${id}」が空、または重複しています。`);
  }
  ids.add(id);
}

function coerceTournament(value: unknown): Tournament {
  if (!isRecord(value)) {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "トーナメントデータとして必要な項目が不足しています。");
  }

  const fallback = createDefaultTournament();
  const drawSize = coerceDrawSize(value.drawSize, fallback.drawSize);
  const now = new Date().toISOString();
  const id = coerceString(value.id) || fallback.id;

  return {
    ...fallback,
    id,
    title: coerceString(value.title) ?? "",
    date: coerceString(value.date) ?? "",
    venue: coerceString(value.venue) ?? "",
    eventName: coerceString(value.eventName) ?? "",
    matchType: value.matchType === "doubles" ? "doubles" : value.matchType === "team" ? "team" : "singles",
    drawSize,
    seedCount: coerceNumber(value.seedCount, fallback.seedCount),
    entrants: Array.isArray(value.entrants) ? value.entrants.map((entrant, index) => coerceEntrant(entrant, index)) : [],
    options: isRecord(value.options)
      ? {
          avoidSameTeam: coerceBoolean(value.options.avoidSameTeam, true),
          avoidSameRegion: coerceBoolean(value.options.avoidSameRegion, true),
          prioritizeSeedBye: coerceBoolean(value.options.prioritizeSeedBye, true),
          seedPositionMode: coerceSeedPositionMode(value.options.seedPositionMode, fallback.options.seedPositionMode),
          thirdFourthSeedPlacement: coerceThirdFourthSeedPlacement(
            value.options.thirdFourthSeedPlacement,
            fallback.options.thirdFourthSeedPlacement,
          ),
          fixByePositionOnSeedLottery: coerceBoolean(
            value.options.fixByePositionOnSeedLottery,
            fallback.options.fixByePositionOnSeedLottery ?? true,
          ),
          entrantPlacementOrder: coerceEntrantPlacementOrder(
            value.options.entrantPlacementOrder,
            fallback.options.entrantPlacementOrder,
          ),
          randomSeed: coerceString(value.options.randomSeed),
        }
      : fallback.options,
    outputOptions: normalizeDrawOutputOptions(value.outputOptions ?? fallback.outputOptions),
    generatedDraw: coerceGeneratedDraw(value.generatedDraw, id),
    createdAt: coerceString(value.createdAt) ?? now,
    updatedAt: coerceString(value.updatedAt) ?? now,
  };
}

function coerceEntrant(value: unknown, index: number): Entrant {
  if (!isRecord(value)) {
    return { id: createId(`entrant-${index + 1}`), player1Name: "" };
  }
  return {
    id: coerceString(value.id) ?? createId(`entrant-${index + 1}`),
    seedNo: coerceNumberOrString(value.seedNo),
    player1Name: coerceString(value.player1Name) ?? "",
    player2Name: coerceString(value.player2Name),
    teamName: coerceString(value.teamName),
    memberNames: Array.isArray(value.memberNames)
      ? value.memberNames.filter((memberName): memberName is string => typeof memberName === "string")
      : undefined,
    team1: coerceString(value.team1),
    team2: coerceString(value.team2),
    sameTeam: coerceBoolean(value.sameTeam, false),
    sameTeamGroup: coerceString(value.sameTeamGroup)?.trim() || undefined,
    region: coerceString(value.region),
    ranking: coerceNumberOrString(value.ranking),
  };
}

function coerceGeneratedDraw(value: unknown, tournamentId: string): GeneratedDraw | undefined {
  if (!isRecord(value) || !Array.isArray(value.slots)) {
    return undefined;
  }
  const slots = value.slots
    .map(coerceDrawSlot)
    .filter((slot): slot is DrawSlot => slot !== undefined)
    .sort((left, right) => left.position - right.position);

  if (slots.length === 0) {
    return undefined;
  }
  return {
    id: coerceString(value.id) ?? createId("draw"),
    tournamentId: coerceString(value.tournamentId) ?? tournamentId,
    randomSeed: coerceString(value.randomSeed) ?? createRandomSeed(),
    slots,
    generatedAt: coerceString(value.generatedAt) ?? new Date().toISOString(),
    generationInputSignature: coerceString(value.generationInputSignature),
  };
}

function coerceDrawSlot(value: unknown): DrawSlot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const position = coerceNumber(value.position, Number.NaN);
  if (!Number.isInteger(position) || position < 1) {
    return undefined;
  }
  return {
    position,
    entrantId: coerceString(value.entrantId),
    isBye: coerceBoolean(value.isBye, false),
    seedNo: typeof value.seedNo === "number" && Number.isInteger(value.seedNo) ? value.seedNo : undefined,
  };
}

function downloadJson(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

function coerceDrawSize(value: unknown, fallback: DrawSize): DrawSize {
  const numeric = typeof value === "number" ? value : Number(value);
  return VALID_DRAW_SIZES.includes(numeric as DrawSize) ? numeric as DrawSize : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function coerceNumberOrString(value: unknown): number | string | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function coerceSeedPositionMode(
  value: unknown,
  fallback: DrawOptions["seedPositionMode"],
): DrawOptions["seedPositionMode"] {
  return value === "fixed" || value === "jtaRulebook" || value === "grandSlam" ? value : fallback;
}

function coerceThirdFourthSeedPlacement(
  value: unknown,
  fallback: DrawOptions["thirdFourthSeedPlacement"],
): DrawOptions["thirdFourthSeedPlacement"] {
  return value === "tennisRule" || value === "standard" ? value : fallback;
}

function coerceEntrantPlacementOrder(
  value: unknown,
  fallback: DrawOptions["entrantPlacementOrder"],
): DrawOptions["entrantPlacementOrder"] {
  return value === "largeTeamFirst" || value === "random" || value === "rosterOrder" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTournamentLike(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && (value.matchType === "singles" || value.matchType === "doubles" || value.matchType === "team")
    && "drawSize" in value
    && Array.isArray(value.entrants)
    && isRecord(value.options);
}

class ImportDataError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}
