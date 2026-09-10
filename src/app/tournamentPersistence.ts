import type {
  DrawOptions,
  DrawSize,
  DrawSlot,
  Entrant,
  GeneratedDraw,
  Tournament,
  TournamentMatch,
  TournamentMatchResult,
  TournamentMatchSource,
  TournamentMatchFormat,
} from "../domain/types";
import type { TournamentIntegrationRecord, TournamentIntegrationParticipant } from "../domain/leagueTournamentTypes";
import { normalizeDrawOutputOptions } from "../domain/outputOptions";
import { createTournamentMatches, ensureTournamentMatches } from "../domain/tournamentMatches";
import { normalizeSetScores } from "../domain/matchScoring";
import { VALID_DRAW_SIZES } from "../domain/types";
import {
  createDefaultTournament,
  createGenerationInputSignature,
  createId,
  createRandomSeed,
  getTournamentMatchFormat,
  isTournamentDrawCurrent,
  touchTournament,
} from "./tournamentModel";

export const BACKUP_SCHEMA_VERSION = 1;

export type TournamentExport = {
  schemaVersion: 1;
  exportedAt: string;
  tournament: Tournament;
  integration?: TournamentIntegrationRecord;
};

export type TournamentBackup = {
  schemaVersion: 1;
  exportedAt: string;
  tournaments: Tournament[];
  integrations?: TournamentIntegrationRecord[];
};

export type ImportParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "success"; tournament: Tournament; message: string };

export type JsonImportParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; code: string; message: string }
  | { state: "success"; kind: "tournament"; tournament: Tournament; integration?: TournamentIntegrationRecord; message: string }
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
    const imported = cloneImportedTournamentWithIntegration(
      candidate,
      isRecord(parsed) && isRecord(parsed.integration) ? parsed.integration : undefined,
      now,
    );
    return {
      state: "success",
      kind: "tournament",
      tournament: imported.tournament,
      integration: imported.integration,
      message: `個別大会データです。参加者${imported.tournament.entrants.length}件を検出しました。`,
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
  integration?: TournamentIntegrationRecord,
): string {
  const data: TournamentExport = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    tournament,
    ...(integration ? { integration } : {}),
  };
  return JSON.stringify(data, null, 2);
}

export function serializeAllTournaments(
  tournaments: readonly Tournament[],
  exportedAt = new Date().toISOString(),
  integrations: readonly TournamentIntegrationRecord[] = [],
): string {
  const data: TournamentBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    tournaments: [...tournaments],
    ...(integrations.length > 0 ? { integrations: [...integrations] } : {}),
  };
  return JSON.stringify(data, null, 2);
}

export function downloadTournament(tournament: Tournament, integration?: TournamentIntegrationRecord): void {
  const fileNameBase = sanitizeFileName(tournament.title || tournament.id);
  downloadJson(serializeTournament(tournament, new Date().toISOString(), integration), `drawlab_${fileNameBase}.json`);
}

export function downloadAllTournaments(
  tournaments: readonly Tournament[],
  integrations: readonly TournamentIntegrationRecord[] = [],
): void {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  downloadJson(serializeAllTournaments(tournaments, new Date().toISOString(), integrations), `drawlab_backup_${timestamp}.json`);
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

export function normalizeStoredTournament(tournament: Tournament): Tournament {
  const generatedDraw = tournament.generatedDraw;
  const storedMatches = (generatedDraw as (GeneratedDraw & { matches?: unknown }) | undefined)?.matches;

  if (!generatedDraw || Array.isArray(storedMatches) && storedMatches.length > 0) {
    return tournament;
  }

  return {
    ...tournament,
    generatedDraw: {
      ...generatedDraw,
      matches: ensureTournamentMatches(generatedDraw, tournament.drawSize, getTournamentMatchFormat(tournament)),
    },
  };
}

export function cloneImportedTournament(value: unknown, now = new Date().toISOString()): Tournament {
  return cloneImportedTournamentWithIntegration(value, undefined, now).tournament;
}

export function cloneImportedTournamentWithIntegration(
  value: unknown,
  integrationValue: unknown,
  now = new Date().toISOString(),
): { tournament: Tournament; integration?: TournamentIntegrationRecord } {
  if (isRecord(value) && value.generatedDraw !== undefined) {
    validateStoredDrawShape(value.generatedDraw);
  }
  const source = coerceTournament(value);
  const sourceIntegration = integrationValue === undefined ? undefined : coerceIntegration(integrationValue);
  validateTournamentReferences(source, new Set<string>());
  validateIntegrationReferences(source, sourceIntegration);
  const sourceDrawIsCurrent = isTournamentDrawCurrent(source, sourceIntegration);
  const tournamentId = createId("tournament");
  const entrantIdMap = new Map<string, string>();
  const entrants = source.entrants.map((entrant, index) => {
    const id = createId(`entrant-${index + 1}`);
    entrantIdMap.set(entrant.id, id);
    return { ...entrant, id };
  });

  const generatedDraw = source.generatedDraw
    ? cloneGeneratedDraw(source.generatedDraw, tournamentId, entrantIdMap)
    : undefined;

  const tournament: Tournament = {
    ...source,
    id: tournamentId,
    entrants,
    generatedDraw,
    createdAt: now,
    updatedAt: now,
  };

  if (tournament.generatedDraw && !sourceDrawIsCurrent) {
    tournament.generatedDraw = undefined;
  }

  const importedIntegration = sourceIntegration
    ? remapImportedIntegration(sourceIntegration, tournamentId, entrantIdMap, now)
    : undefined;

  if (tournament.generatedDraw && sourceDrawIsCurrent) {
    tournament.generatedDraw = {
      ...tournament.generatedDraw,
      generationInputSignature: createGenerationInputSignature(tournament, importedIntegration),
    };
  }

  return { tournament, integration: importedIntegration };
}

function cloneGeneratedDraw(
  source: GeneratedDraw,
  tournamentId: string,
  entrantIdMap: ReadonlyMap<string, string>,
): GeneratedDraw {
  const sourceMatches = source.matches ?? [];
  const matchIdMap = new Map(sourceMatches.map((match) => [match.id, createId("match")]));

  return {
    ...source,
    id: createId("draw"),
    tournamentId,
    matches: sourceMatches.map((match) => ({
      ...match,
      id: matchIdMap.get(match.id) ?? createId("match"),
      sourceA: remapMatchSource(match.sourceA, matchIdMap),
      sourceB: remapMatchSource(match.sourceB, matchIdMap),
    })),
    slots: source.slots.map((slot) => {
      if (!slot.entrantId) {
        return { ...slot };
      }

      const entrantId = entrantIdMap.get(slot.entrantId);
      if (!entrantId) {
        throw new ImportDataError("IMPORT_REFERENCE_INVALID", "生成済みドローが存在しない参加者を参照しています。");
      }
      return { ...slot, entrantId };
    }),
  };
}

function remapMatchSource(
  source: TournamentMatchSource,
  matchIdMap: ReadonlyMap<string, string>,
): TournamentMatchSource {
  if ("slotPosition" in source) {
    return { ...source };
  }
  const matchId = matchIdMap.get(source.matchId);
  if (!matchId) {
    throw new ImportDataError("IMPORT_REFERENCE_INVALID", "対戦カードの前回戦参照が不正です。");
  }
  return { matchId };
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

  const integrations = Array.isArray(value.integrations)
    ? value.integrations.map((item) => coerceIntegration(item))
    : undefined;
  const tournamentIds = new Set(tournaments.map((tournament) => tournament.id));
  const integrationIds = new Set<string>();
  for (const integration of integrations ?? []) {
    if (integrationIds.has(integration.tournamentId)) {
      throw new ImportDataError("BACKUP_DUPLICATE_ID", `連携情報の大会ID「${integration.tournamentId}」が重複しています。`);
    }
    if (!tournamentIds.has(integration.tournamentId)) {
      throw new ImportDataError("BACKUP_REFERENCE_INVALID", "連携情報が存在しない大会を参照しています。");
    }
    integrationIds.add(integration.tournamentId);
    validateIntegrationReferences(
      tournaments.find((tournament) => tournament.id === integration.tournamentId)!,
      integration,
    );
  }

  return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: value.exportedAt, tournaments, integrations };
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
    || (value.status !== undefined && value.status !== "inProgress" && value.status !== "completed")
    || (value.matchFormat !== undefined && value.matchFormat !== 1 && value.matchFormat !== 3 && value.matchFormat !== 5)
    || (value.detailInputEnabled !== undefined && typeof value.detailInputEnabled !== "boolean")
    || (value.matchSelectionStatus !== undefined
      && value.matchSelectionStatus !== "pending"
      && value.matchSelectionStatus !== "confirmed")
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

  if (value.matches !== undefined) {
    if (!Array.isArray(value.matches)) {
      throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内の対戦カードが不正です。");
    }
    validateStoredMatches(value.matches);
  }
}

function validateStoredMatches(value: unknown[]): void {
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || !item.id
      || typeof item.round !== "number"
      || !Number.isInteger(item.round)
      || item.round < 1
      || typeof item.matchNo !== "number"
      || !Number.isInteger(item.matchNo)
      || item.matchNo < 1
      || !isTournamentMatchSource(item.sourceA)
      || !isTournamentMatchSource(item.sourceB)
      || !isTournamentMatchResult(item.result)
      || (item.note !== undefined && typeof item.note !== "string")
      || (item.setScores !== undefined && !isStoredSetScores(item.setScores))
      || ids.has(item.id)) {
      throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "バックアップ内の対戦カードが不正です。");
    }
    ids.add(item.id);
  }

  for (const item of value) {
    if (!isRecord(item)) continue;
    for (const source of [item.sourceA, item.sourceB]) {
      if (isRecord(source)
        && "matchId" in source
        && typeof source.matchId === "string"
        && !ids.has(source.matchId)) {
        throw new ImportDataError("BACKUP_REFERENCE_INVALID", "対戦カードの前回戦参照が不正です。");
      }
    }
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
  const matchIds = new Set<string>();
  for (const match of tournament.generatedDraw.matches ?? []) {
    if (matchIds.has(match.id)) {
      throw new ImportDataError("BACKUP_DUPLICATE_ID", `対戦カードID「${match.id}」が重複しています。`);
    }
    matchIds.add(match.id);
  }
  for (const match of tournament.generatedDraw.matches ?? []) {
    for (const source of [match.sourceA, match.sourceB]) {
      if ("matchId" in source && !matchIds.has(source.matchId)) {
        throw new ImportDataError("BACKUP_REFERENCE_INVALID", "対戦カードの前回戦参照が不正です。");
      }
    }
  }
}

function validateIntegrationReferences(
  tournament: Tournament,
  integration: TournamentIntegrationRecord | undefined,
): void {
  if (!integration) return;
  if (integration.tournamentId !== tournament.id) {
    throw new ImportDataError("BACKUP_REFERENCE_INVALID", "連携情報の大会ID参照が不正です。");
  }
  const entrantIds = new Set(tournament.entrants.map((entrant) => entrant.id));
  const integrationEntrantIds = new Set<string>();
  for (const participant of integration.participants) {
    if (!entrantIds.has(participant.tournamentEntrantId) || integrationEntrantIds.has(participant.tournamentEntrantId)) {
      throw new ImportDataError("BACKUP_REFERENCE_INVALID", "連携情報が不正な参加者を参照しています。");
    }
    integrationEntrantIds.add(participant.tournamentEntrantId);
    if (participant.rank !== undefined && (!Number.isInteger(participant.rank) || participant.rank < 1)) {
      throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "連携情報の順位が不正です。");
    }
  }
}

function remapImportedIntegration(
  integration: TournamentIntegrationRecord,
  tournamentId: string,
  entrantIdMap: ReadonlyMap<string, string>,
  now: string,
): TournamentIntegrationRecord {
  return {
    ...integration,
    tournamentId,
    participants: integration.participants.map((participant) => {
      const tournamentEntrantId = entrantIdMap.get(participant.tournamentEntrantId);
      if (!tournamentEntrantId) {
        throw new ImportDataError("IMPORT_REFERENCE_INVALID", "連携情報が存在しない参加者を参照しています。");
      }
      return { ...participant, tournamentEntrantId };
    }),
    createdAt: now,
    updatedAt: now,
  };
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
  const matchFormat = coerceMatchFormat(value.matchFormat, fallback.matchFormat ?? 1);
  const now = new Date().toISOString();
  const id = coerceString(value.id) || fallback.id;
  const generatedDraw = coerceGeneratedDraw(value.generatedDraw, id, drawSize, matchFormat);

  return {
    ...fallback,
    id,
    status: value.status === "completed" ? "completed" : "inProgress",
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
    matchFormat,
    detailInputEnabled: coerceBoolean(value.detailInputEnabled, fallback.detailInputEnabled ?? false),
    matchSelectionStatus: value.matchSelectionStatus === "pending" || value.matchSelectionStatus === "confirmed"
      ? value.matchSelectionStatus
      : generatedDraw ? "confirmed" : "pending",
    generatedDraw,
    createdAt: coerceString(value.createdAt) ?? now,
    updatedAt: coerceString(value.updatedAt) ?? now,
  };
}

function coerceIntegration(value: unknown): TournamentIntegrationRecord {
  if (!isRecord(value)
    || value.kind !== "league-to-tournament"
    || value.schemaVersion !== 1
    || !isRecord(value.source)
    || typeof value.source.leagueId !== "string"
    || typeof value.source.leagueUpdatedAt !== "string"
    || (value.source.matchSelectionStatus !== "pending" && value.source.matchSelectionStatus !== "confirmed")
    || (value.sourceParticipantType !== "individual" && value.sourceParticipantType !== "doubles" && value.sourceParticipantType !== "team")
    || !isRecord(value.rankRange)
    || typeof value.rankRange.min !== "number"
    || typeof value.rankRange.max !== "number"
    || !Number.isInteger(value.rankRange.min)
    || !Number.isInteger(value.rankRange.max)
    || !Array.isArray(value.participants)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || typeof value.tournamentId !== "string") {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", "リーグ連携情報の形式が不正です。");
  }

  return {
    tournamentId: value.tournamentId,
    kind: "league-to-tournament",
    schemaVersion: 1,
    source: {
      leagueId: value.source.leagueId,
      leagueUpdatedAt: value.source.leagueUpdatedAt,
      matchSelectionStatus: value.source.matchSelectionStatus,
    },
    sourceParticipantType: value.sourceParticipantType,
    sourceGroupCount: typeof value.sourceGroupCount === "number" ? value.sourceGroupCount : undefined,
    sourceGroupSizes: Array.isArray(value.sourceGroupSizes)
      && value.sourceGroupSizes.every((size): size is number => typeof size === "number" && Number.isInteger(size) && size >= 0)
      ? [...value.sourceGroupSizes]
      : undefined,
    rankRange: { min: value.rankRange.min, max: value.rankRange.max },
    drawSizeMode: value.drawSizeMode === "auto" || value.drawSizeMode === "manual" ? value.drawSizeMode : undefined,
    participants: value.participants.map((participant, index) => coerceIntegrationParticipant(participant, index)),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function coerceIntegrationParticipant(value: unknown, index: number): TournamentIntegrationParticipant {
  if (!isRecord(value) || typeof value.tournamentEntrantId !== "string" || !value.tournamentEntrantId) {
    throw new ImportDataError("IMPORT_INVALID_TOURNAMENT", `リーグ連携情報の参加者${index + 1}が不正です。`);
  }
  return {
    tournamentEntrantId: value.tournamentEntrantId,
    sourceParticipantId: coerceString(value.sourceParticipantId),
    sourceGroupId: coerceString(value.sourceGroupId),
    sourceGroupName: coerceString(value.sourceGroupName),
    sourceGroupOrder: typeof value.sourceGroupOrder === "number" ? value.sourceGroupOrder : undefined,
    groupKey: coerceString(value.groupKey),
    groupLabel: coerceString(value.groupLabel),
    rank: typeof value.rank === "number" ? value.rank : undefined,
    rankOrigin: value.rankOrigin === "league" || value.rankOrigin === "tournament-manual" ? value.rankOrigin : undefined,
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

function coerceGeneratedDraw(
  value: unknown,
  tournamentId: string,
  drawSize: DrawSize,
  matchFormat: TournamentMatchFormat = 1,
): GeneratedDraw | undefined {
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
  const matches = coerceTournamentMatches(value.matches, matchFormat)
    ?? createTournamentMatches(slots, drawSize, undefined, matchFormat);
  return {
    id: coerceString(value.id) ?? createId("draw"),
    tournamentId: coerceString(value.tournamentId) ?? tournamentId,
    randomSeed: coerceString(value.randomSeed) ?? createRandomSeed(),
    slots,
    matches,
    generatedAt: coerceString(value.generatedAt) ?? new Date().toISOString(),
    generationInputSignature: coerceString(value.generationInputSignature),
  };
}

function coerceTournamentMatches(value: unknown, matchFormat: TournamentMatchFormat): TournamentMatch[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const matches = value
    .map((match) => coerceTournamentMatch(match, matchFormat))
    .filter((match): match is TournamentMatch => match !== undefined)
    .sort((left, right) => left.round - right.round || left.matchNo - right.matchNo);
  return matches.length > 0 ? matches : undefined;
}

function coerceTournamentMatch(value: unknown, matchFormat: TournamentMatchFormat): TournamentMatch | undefined {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.round !== "number"
    || typeof value.matchNo !== "number"
    || !isTournamentMatchSource(value.sourceA)
    || !isTournamentMatchSource(value.sourceB)) {
    return undefined;
  }
  return {
    id: value.id,
    round: value.round,
    matchNo: value.matchNo,
    sourceA: value.sourceA,
    sourceB: value.sourceB,
    result: isTournamentMatchResult(value.result) ? value.result : "unplayed",
    setScores: normalizeSetScores(value.setScores, matchFormat),
    note: typeof value.note === "string" && value.note.trim() ? value.note : undefined,
  };
}

function isTournamentMatchSource(value: unknown): value is TournamentMatchSource {
  if (!isRecord(value)) {
    return false;
  }
  const hasSlotPosition = typeof value.slotPosition === "number"
    && Number.isInteger(value.slotPosition)
    && value.slotPosition > 0;
  const hasMatchId = typeof value.matchId === "string" && value.matchId.length > 0;
  return hasSlotPosition !== hasMatchId;
}

function isTournamentMatchResult(value: unknown): value is TournamentMatchResult {
  return value === "unplayed" || value === "participantAWin" || value === "participantBWin";
}

function isStoredSetScores(value: unknown): boolean {
  return Array.isArray(value) && value.every((score) => {
    if (!isRecord(score)) return false;
    return [score.participantA, score.participantB].every((value) => (
      value === null
      || (typeof value === "number" && Number.isInteger(value) && value >= 0)
    ));
  });
}

function coerceMatchFormat(value: unknown, fallback: TournamentMatchFormat = 1): TournamentMatchFormat {
  return value === 3 || value === 5 ? value : fallback;
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
