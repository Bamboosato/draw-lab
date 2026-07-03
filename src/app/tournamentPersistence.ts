import type { DrawOptions, DrawSize, DrawSlot, Entrant, GeneratedDraw, Tournament } from "../domain/types";
import { VALID_DRAW_SIZES } from "../domain/types";
import { createDefaultTournament, createId, createRandomSeed, touchTournament } from "./tournamentModel";

const STORAGE_KEY = "drawlab:tournaments";

type StoredData = {
  version: 1;
  tournaments: Tournament[];
};

export type ImportParseResult =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "success"; tournament: Tournament; message: string };

export function loadTournaments(): Tournament[] {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed) || !Array.isArray(parsed.tournaments)) {
      return [];
    }

    return parsed.tournaments.map((item) => coerceTournament(item));
  } catch {
    return [];
  }
}

export function saveTournaments(tournaments: readonly Tournament[]): void {
  const data: StoredData = {
    version: 1,
    tournaments: [...tournaments],
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function parseTournamentImport(text: string): ImportParseResult {
  if (!text.trim()) {
    return {
      state: "empty",
      message: "大会情報を読み込むと解析結果が表示されます。未入力時はエラーを表示しません。",
    };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const candidate = pickTournamentCandidate(parsed);

    if (!candidate) {
      return {
        state: "error",
        message: "トーナメントデータとして必要な項目が不足しています。",
      };
    }

    const tournament = coerceTournament(candidate, true);

    return {
      state: "success",
      tournament,
      message: `有効な大会情報です。参加者${tournament.entrants.length}件を検出しました。`,
    };
  } catch {
    return {
      state: "error",
      message: "大会情報を解析できません。ファイルまたは入力内容を確認してください。",
    };
  }
}

export function serializeTournament(tournament: Tournament): string {
  return JSON.stringify(tournament, null, 2);
}

export function downloadTournament(tournament: Tournament): void {
  const fileNameBase = (tournament.title || tournament.id).replace(/[\\/:*?"<>|]/g, "_");
  const blob = new Blob([serializeTournament(tournament)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `drawlab_${fileNameBase}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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

function pickTournamentCandidate(value: unknown): unknown {
  if (isRecord(value) && Array.isArray(value.tournaments)) {
    return value.tournaments[0];
  }

  return value;
}

function coerceTournament(value: unknown, replaceId = false): Tournament {
  if (!isRecord(value)) {
    throw new Error("Invalid tournament.");
  }

  const fallback = createDefaultTournament();
  const drawSize = coerceDrawSize(value.drawSize, fallback.drawSize);
  const now = new Date().toISOString();
  const id = replaceId ? createId("tournament") : coerceString(value.id) || fallback.id;

  return {
    ...fallback,
    id,
    title: coerceString(value.title) ?? "",
    date: coerceString(value.date) ?? "",
    venue: coerceString(value.venue) ?? "",
    eventName: coerceString(value.eventName) ?? "",
    matchType: value.matchType === "doubles" ? "doubles" : "singles",
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
    generatedDraw: coerceGeneratedDraw(value.generatedDraw, id),
    createdAt: coerceString(value.createdAt) ?? now,
    updatedAt: now,
  };
}

function coerceEntrant(value: unknown, index: number): Entrant {
  if (!isRecord(value)) {
    return {
      id: createId(`entrant-${index + 1}`),
      player1Name: "",
    };
  }

  return {
    id: coerceString(value.id) ?? createId(`entrant-${index + 1}`),
    seedNo: coerceNumberOrString(value.seedNo),
    player1Name: coerceString(value.player1Name) ?? "",
    player2Name: coerceString(value.player2Name),
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
    .sort((a, b) => a.position - b.position);

  if (slots.length === 0) {
    return undefined;
  }

  return {
    id: coerceString(value.id) ?? createId("draw"),
    tournamentId: coerceString(value.tournamentId) ?? tournamentId,
    randomSeed: coerceString(value.randomSeed) ?? createRandomSeed(),
    slots,
    generatedAt: coerceString(value.generatedAt) ?? new Date().toISOString(),
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
