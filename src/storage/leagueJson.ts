import type { League } from "../domain/leagueTypes";
import { createDefaultLeague, createId } from "../app/leagueModel";

export const LEAGUE_JSON_SCHEMA_VERSION = 1;

export type LeagueJsonEnvelope = {
  kind: "draw-lab-league";
  schemaVersion: 1;
  exportedAt: string;
  league: League;
};

export type LeagueBackupEnvelope = {
  kind: "draw-lab-league-backup";
  schemaVersion: 1;
  exportedAt: string;
  leagues: League[];
};

export type LeagueJsonParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "success"; kind: "league"; league: League; message: string }
  | { state: "success"; kind: "backup"; backup: LeagueBackupEnvelope; message: string };

export function serializeLeague(league: League, exportedAt = new Date().toISOString()): string {
  const envelope: LeagueJsonEnvelope = {
    kind: "draw-lab-league",
    schemaVersion: LEAGUE_JSON_SCHEMA_VERSION,
    exportedAt,
    league,
  };
  return JSON.stringify(envelope, null, 2);
}

export function serializeAllLeagues(leagues: readonly League[], exportedAt = new Date().toISOString()): string {
  const envelope: LeagueBackupEnvelope = {
    kind: "draw-lab-league-backup",
    schemaVersion: LEAGUE_JSON_SCHEMA_VERSION,
    exportedAt,
    leagues: [...leagues],
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseLeagueJson(text: string, now = new Date().toISOString()): LeagueJsonParseResult {
  if (!text.trim()) {
    return { state: "empty", message: "リーグJSONを読み込むと読込結果が表示されます。" };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed) && parsed.kind === "draw-lab-league-backup") {
      const backup = parseLeagueBackup(parsed, now);
      return {
        state: "success",
        kind: "backup",
        backup,
        message: `全リーグバックアップです。リーグ${backup.leagues.length}件を検出しました。`,
      };
    }
    if (!isRecord(parsed) || parsed.kind !== "draw-lab-league" || parsed.schemaVersion !== LEAGUE_JSON_SCHEMA_VERSION || !isRecord(parsed.league)) {
      throw new Error("対応していないリーグJSONです。");
    }
    const league = cloneImportedLeague(parsed.league, now);
    return { state: "success", kind: "league", league, message: `個別リーグデータです。参加単位${league.participants.length}件を検出しました。` };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : "リーグJSONを解析できません。" };
  }
}

function parseLeagueBackup(value: Record<string, unknown>, now: string): LeagueBackupEnvelope {
  if (value.schemaVersion !== LEAGUE_JSON_SCHEMA_VERSION || typeof value.exportedAt !== "string" || !Array.isArray(value.leagues)) {
    throw new Error("全リーグバックアップに必要な項目が不足しています。");
  }

  const leagues = value.leagues.map((league) => cloneImportedLeague(league, now, {
    preserveIdentity: true,
    preserveTimestamps: true,
  }));
  const ids = new Set<string>();
  for (const league of leagues) {
    if (!league.id || ids.has(league.id)) {
      throw new Error("リーグIDが空、または重複しています。");
    }
    ids.add(league.id);
  }

  return {
    kind: "draw-lab-league-backup",
    schemaVersion: LEAGUE_JSON_SCHEMA_VERSION,
    exportedAt: value.exportedAt,
    leagues,
  };
}

export function cloneImportedLeague(
  value: unknown,
  now = new Date().toISOString(),
  options: { preserveIdentity?: boolean; preserveTimestamps?: boolean } = {},
): League {
  if (!isRecord(value)) {
    throw new Error("リーグデータが不正です。");
  }
  const fallback = createDefaultLeague();
  const source = value as Partial<League>;
  if (typeof source.title !== "string" || !Array.isArray(source.participants) || !Array.isArray(source.groups) || !Array.isArray(source.matches)) {
    throw new Error("リーグJSONに必要な項目が不足しています。");
  }
  const leagueId = options.preserveIdentity && typeof source.id === "string" ? source.id : createId("league");
  const participantIdMap = new Map<string, string>();
  const participants = source.participants.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.displayName !== "string" || !Array.isArray(item.memberNames)) {
      throw new Error("リーグ参加単位の形式が不正です。");
    }
    const id = options.preserveIdentity ? item.id : createId("participant");
    participantIdMap.set(item.id, id);
    return { ...item, id } as League["participants"][number];
  });
  const groupIdMap = new Map<string, string>();
  const groups = source.groups.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.participantIds)) {
      throw new Error("リーググループの形式が不正です。");
    }
    const id = options.preserveIdentity ? item.id : createId("group");
    groupIdMap.set(item.id, id);
    return { ...item, id, participantIds: item.participantIds.map((participantId) => participantIdMap.get(participantId) ?? "") } as League["groups"][number];
  });
  if (groups.some((group) => group.participantIds.some((participantId) => !participantId))) {
    throw new Error("リーググループが存在しない参加単位を参照しています。");
  }
  const matches = source.matches.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.groupId !== "string" || typeof item.participantAId !== "string" || typeof item.participantBId !== "string") {
      throw new Error("リーグ対戦カードの形式が不正です。");
    }
    return {
      ...item,
      id: options.preserveIdentity ? item.id : createId("match"),
      groupId: groupIdMap.get(item.groupId) ?? "",
      participantAId: participantIdMap.get(item.participantAId) ?? "",
      participantBId: participantIdMap.get(item.participantBId) ?? "",
    } as League["matches"][number];
  });
  if (matches.some((match) => !match.groupId || !match.participantAId || !match.participantBId)) {
    throw new Error("リーグ対戦カードが存在しない参加単位またはグループを参照しています。");
  }
  const standings = Array.isArray(source.standings)
    ? source.standings.map((item) => ({
        ...item,
        groupId: groupIdMap.get(item.groupId) ?? "",
        participantId: participantIdMap.get(item.participantId) ?? "",
      })).filter((item) => item.groupId && item.participantId) as League["standings"]
    : [];
  const selectedParticipantIds = Array.isArray(source.selection?.selectedParticipantIds)
    ? source.selection.selectedParticipantIds.map((id) => participantIdMap.get(id) ?? "").filter(Boolean)
    : [];
  const reserveParticipantIds = Array.isArray(source.selection?.reserveParticipantIds)
    ? source.selection.reserveParticipantIds.map((id) => participantIdMap.get(id) ?? "").filter(Boolean)
    : [];

  return {
    ...fallback,
    ...source,
    id: leagueId,
    participants,
    selection: {
      ...fallback.selection,
      ...source.selection,
      selectedParticipantIds,
      reserveParticipantIds,
    },
    groups,
    matches,
    standings,
    createdAt: options.preserveTimestamps && typeof source.createdAt === "string" ? source.createdAt : now,
    updatedAt: options.preserveTimestamps && typeof source.updatedAt === "string" ? source.updatedAt : now,
  };
}

export function downloadLeague(league: League): void {
  const baseName = (league.title || league.id).replace(/[\\/:*?"<>|]/g, "_");
  const blob = new Blob([serializeLeague(league)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `drawlab_league_${baseName}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadAllLeagues(leagues: readonly League[]): void {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const blob = new Blob([serializeAllLeagues(leagues)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `drawlab_league_backup_${timestamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
