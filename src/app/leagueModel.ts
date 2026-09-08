import {
  calculateStandings,
  createCandidateMatches,
  DEFAULT_LEAGUE_SCORING_POLICY,
  hasLeagueResults,
  inferMatchWinnerFromSetScores,
  isLeagueParticipantEmpty,
  validateLeague,
} from "../domain/leagueLogic";
import {
  createEmptySetScores,
  normalizeSetScores,
  type League,
  type LeagueMatch,
  type LeagueParticipant,
  type LeagueParticipantType,
  type MatchFormat,
  type LeagueSelectionMode,
} from "../domain/leagueTypes";

export const DEFAULT_MATCH_FORMAT: MatchFormat = 1;

export function normalizeLeague(league: League): League {
  const matchFormat = normalizeMatchFormat((league as League & { matchFormat?: unknown }).matchFormat);
  const detailInputEnabled = (league as League & { detailInputEnabled?: unknown }).detailInputEnabled === true;
  const detailDisplayEnabled = detailInputEnabled
    && (league as League & { detailDisplayEnabled?: unknown }).detailDisplayEnabled === true;
  return {
    ...league,
    matchFormat,
    detailInputEnabled,
    detailDisplayEnabled,
    matches: league.matches.map((match) => ({
      ...match,
      setScores: detailInputEnabled
        ? normalizeSetScores((match as LeagueMatch & { setScores?: unknown }).setScores, matchFormat)
        : createEmptySetScores(matchFormat),
    })),
  };
}

export function createDefaultLeague(): League {
  const now = new Date().toISOString();
  return {
    id: createId("league"),
    title: "",
    date: "",
    venue: "",
    eventName: "",
    participantType: "individual",
    matchFormat: DEFAULT_MATCH_FORMAT,
    detailInputEnabled: false,
    detailDisplayEnabled: false,
    capacity: 8,
    participants: createEmptyLeagueParticipants(8, "individual"),
    selection: {
      mode: "all",
      selectedParticipantIds: [],
      reserveParticipantIds: [],
    },
    groups: [],
    scoringPolicy: { ...DEFAULT_LEAGUE_SCORING_POLICY },
    matches: [],
    standings: [],
    status: "draft",
    matchSelectionStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function createLeagueParticipant(
  index: number,
  participantType: LeagueParticipantType,
): LeagueParticipant {
  return {
    id: createId(`participant-${index}`),
    displayName: "",
    participantType,
    memberNames: participantType === "doubles" ? ["", ""] : [],
    team: "",
    region: "",
    note: "",
    selectionStatus: "excluded",
  };
}

export function createEmptyLeagueParticipants(
  count: number,
  participantType: LeagueParticipantType,
): LeagueParticipant[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => createLeagueParticipant(index + 1, participantType));
}

export function ensureLeagueParticipantRows(league: League): League {
  if (hasLeagueResults(league)
    || !Number.isInteger(league.capacity)
    || league.capacity < 1
    || league.participants.length >= league.capacity
    || league.groups.length > 0
    || league.matches.length > 0) {
    return league;
  }

  return {
    ...league,
    participants: [
      ...league.participants,
      ...createEmptyLeagueParticipants(league.capacity - league.participants.length, league.participantType),
    ],
  };
}

export function touchLeague(league: League, updatedAt = new Date().toISOString()): League {
  return { ...league, updatedAt };
}

export function hasLeagueContentChanged(current: League, next: League): boolean {
  return JSON.stringify({ ...current, updatedAt: undefined }) !== JSON.stringify({ ...next, updatedAt: undefined });
}

export function updateParticipants(league: League, participants: LeagueParticipant[]): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  const previousById = new Map(league.participants.map((participant) => [participant.id, participant]));
  const nextParticipants = participants.map((participant) => {
    const normalized = participant.participantType === "individual"
      ? { ...participant, memberNames: participant.displayName.trim() ? [participant.displayName] : [] }
      : participant;
    const previous = previousById.get(participant.id);
    const selectionStatus = isLeagueParticipantEmpty(normalized)
      ? "excluded"
      : previous && !isLeagueParticipantEmpty(previous)
        ? previous.selectionStatus
        : league.selection.mode === "manual" ? "excluded" : "selected";
    return { ...normalized, selectionStatus };
  });
  const participantsChanged = JSON.stringify(league.participants) !== JSON.stringify(nextParticipants);
  const next = {
    ...league,
    participants: nextParticipants,
    selection: {
      ...league.selection,
      selectedParticipantIds: nextParticipants.filter((participant) => participant.selectionStatus === "selected" && !isLeagueParticipantEmpty(participant)).map((participant) => participant.id),
      reserveParticipantIds: nextParticipants.filter((participant) => participant.selectionStatus === "reserve" && !isLeagueParticipantEmpty(participant)).map((participant) => participant.id),
    },
  };
  if (participantsChanged) {
    return {
      ...next,
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
      status: "draft",
    };
  }
  return rebuildLeague(next, false);
}

export function mergeLeagueParticipantsIntoEmptyRows(
  currentParticipants: readonly LeagueParticipant[],
  incomingParticipants: readonly LeagueParticipant[],
): LeagueParticipant[] {
  const remaining = [...incomingParticipants];
  const merged = currentParticipants.map((participant) => {
    if (!isLeagueParticipantEmpty(participant) || remaining.length === 0) {
      return participant;
    }

    return remaining.shift()!;
  });

  return [...merged, ...remaining];
}

export function updateSelection(
  league: League,
  mode: LeagueSelectionMode,
  selectedParticipantIds: readonly string[],
  reserveParticipantIds: readonly string[],
  randomSeed?: string,
): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  const selected = new Set(selectedParticipantIds);
  const reserve = new Set(reserveParticipantIds);
  const participants = league.participants.map((participant) => ({
    ...participant,
    selectionStatus: selected.has(participant.id)
      ? "selected"
      : reserve.has(participant.id) ? "reserve" : "excluded",
  } satisfies LeagueParticipant));
  const next = {
    ...league,
    participants,
    selection: { mode, randomSeed, selectedParticipantIds: [...selected], reserveParticipantIds: [...reserve] },
  };
  if (!sameIds(league.selection.selectedParticipantIds, next.selection.selectedParticipantIds)) {
    return {
      ...next,
      groups: [],
      matches: [],
      standings: [],
      matchSelectionStatus: "pending",
      status: "draft",
    };
  }
  return rebuildLeague(next, false);
}

export function selectParticipantIds(ids: readonly string[], capacity: number, seed: string): string[] {
  const random = createSeededRandom(seed);
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled.slice(0, Math.max(0, capacity));
}

export function updateGroups(league: League, groups: League["groups"]): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  return rebuildLeague({ ...league, groups, matchSelectionStatus: "pending" }, true);
}

export function updateScoringPolicy(league: League, scoringPolicy: League["scoringPolicy"]): League {
  return {
    ...league,
    scoringPolicy,
    standings: calculateStandings(league.groups, league.matches, scoringPolicy, league.standings),
  };
}

export function updateMatchFormat(league: League, matchFormat: MatchFormat): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  return {
    ...league,
    matchFormat,
    matches: league.matches.map((match) => ({
      ...match,
      setScores: normalizeSetScores(match.setScores, matchFormat),
    })),
  };
}

export function updateDetailInputEnabled(league: League, enabled: boolean): League {
  if (league.status === "completed") return league;
  if (enabled) {
    return {
      ...league,
      detailInputEnabled: true,
      matches: league.matches.map((match) => ({
        ...match,
        setScores: normalizeSetScores(match.setScores, league.matchFormat),
      })),
    };
  }
  return {
    ...league,
    detailInputEnabled: false,
    detailDisplayEnabled: false,
    matches: league.matches.map((match) => ({ ...match, setScores: createEmptySetScores(league.matchFormat) })),
  };
}

export function updateDetailDisplayEnabled(league: League, enabled: boolean): League {
  if (league.status === "completed" || !league.detailInputEnabled) return league;
  return { ...league, detailDisplayEnabled: enabled };
}

export function prepareLeagueMatches(league: League): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  const matches = createCandidateMatches(league.groups, () => createId("match"), league.matchFormat);
  return {
    ...league,
    matches,
    matchSelectionStatus: "pending",
    status: "draft",
    standings: calculateStandings(league.groups, matches, league.scoringPolicy, league.standings),
  };
}

export function updateMatchValidity(league: League, matchId: string, isValid: boolean): League {
  if (league.status === "completed" || league.matchSelectionStatus === "confirmed") return league;
  const matches = league.matches.map((match) => match.id === matchId ? { ...match, isValid } : match);
  return {
    ...league,
    matches,
    standings: calculateStandings(league.groups, matches, league.scoringPolicy, league.standings),
  };
}

export function updateMatch(league: League, matchId: string, patch: Partial<LeagueMatch>): League {
  const matches = league.matches.map((match) => match.id === matchId ? { ...match, ...patch } : match);
  const status = patch.result === undefined
    ? league.status
    : matches.some((match) => match.result !== "unplayed")
      ? "inProgress"
      : league.matchSelectionStatus === "confirmed" ? "scheduled" : "draft";
  return {
    ...league,
    matches,
    status,
    standings: calculateStandings(league.groups, matches, league.scoringPolicy, league.standings),
  };
}

export function updateMatchSetScore(
  league: League,
  matchId: string,
  setIndex: number,
  participant: "participantA" | "participantB",
  value: number | null,
): League {
  if (league.status === "completed" || !league.detailInputEnabled) return league;
  let inferredResult: LeagueMatch["result"] | undefined;
  const matches = league.matches.map((match) => {
    if (match.id !== matchId) return match;
    const setScores = normalizeSetScores(match.setScores, league.matchFormat);
    if (setIndex < 0 || setIndex >= setScores.length) return match;
    setScores[setIndex] = { ...setScores[setIndex], [participant]: normalizeScoreValue(value) };
    const nextMatch = { ...match, setScores };
    if (match.result === "unplayed") {
      inferredResult = inferMatchWinnerFromSetScores(league.matchFormat, setScores);
    }
    return inferredResult ? { ...nextMatch, result: inferredResult } : nextMatch;
  });
  const nextLeague = { ...league, matches };
  return inferredResult ? updateMatch(nextLeague, matchId, { result: inferredResult }) : nextLeague;
}

export function updateManualRanks(league: League, manualRanks: ReadonlyMap<string, number | undefined>): League {
  return {
    ...league,
    standings: league.standings.map((standing) => {
      if (!manualRanks.has(standing.participantId)) return standing;
      const manualRank = manualRanks.get(standing.participantId);
      return { ...standing, manualRank, rankStatus: manualRank === undefined ? "unconfirmed" : "confirmed" };
    }),
  };
}

export function updateManualRank(league: League, participantId: string, manualRank: number | undefined): League {
  return updateManualRanks(league, new Map([[participantId, manualRank]]));
}

export function markMatchSelectionConfirmed(league: League): League {
  if (league.status === "completed" || league.matches.length === 0) return league;
  return { ...league, matchSelectionStatus: "confirmed", status: hasLeagueResults(league) ? "inProgress" : "scheduled" };
}

export function unconfirmMatchSelection(league: League): League {
  if (league.status === "completed" || league.matchSelectionStatus !== "confirmed") return league;
  const matches = league.matches.map((match) => ({ ...match, result: "unplayed" as const }));
  return {
    ...league,
    matches,
    matchSelectionStatus: "pending",
    status: "draft",
    standings: calculateStandings(league.groups, matches, league.scoringPolicy, league.standings),
  };
}

export function reopenLeague(league: League): League {
  return { ...league, status: "inProgress" };
}

export function completeLeague(league: League): League {
  if (league.matchSelectionStatus !== "confirmed" || league.matches.length === 0) {
    return league;
  }
  const validation = validateLeague(league, true);
  if (validation.errors.length > 0) {
    return league;
  }
  return { ...league, status: "completed" };
}

export function rebuildLeague(league: League, preserveMatches: boolean): League {
  if (preserveMatches && league.matches.length > 0 && hasLeagueResults(league)) {
    return league;
  }
  const matches = preserveMatches && league.matches.length > 0
    ? createCandidateMatches(league.groups, () => createId("match"), league.matchFormat)
    : league.matches;
  return {
    ...league,
    matches,
    standings: calculateStandings(league.groups, matches, league.scoringPolicy, league.standings),
  };
}

export function parseLeagueParticipantsFromText(text: string, participantType: LeagueParticipantType): LeagueParticipant[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cells = line.includes("\t") ? line.split("\t") : line.split(",");
      const participant = createLeagueParticipant(index + 1, participantType);
      participant.displayName = (cells[0] ?? "").trim();
      if (participantType === "individual") {
        participant.memberNames = participant.displayName ? [participant.displayName] : [];
        participant.team = (cells[1] ?? "").trim();
        participant.region = (cells[2] ?? "").trim();
        participant.note = (cells[3] ?? "").trim();
      } else if (participantType === "doubles") {
        participant.memberNames = [(cells[1] ?? "").trim(), (cells[2] ?? "").trim()];
        participant.team = (cells[3] ?? "").trim();
        participant.region = (cells[4] ?? "").trim();
        participant.note = (cells[5] ?? "").trim();
      } else {
        participant.memberNames = (cells[1] ?? "").split("/").map((member) => member.trim()).filter(Boolean);
        participant.team = (cells[2] ?? "").trim();
        participant.region = (cells[3] ?? "").trim();
        participant.note = (cells[4] ?? "").trim();
      }
      return participant;
    });
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeMatchFormat(value: unknown): MatchFormat {
  return value === 3 || value === 5 ? value : DEFAULT_MATCH_FORMAT;
}

function normalizeScoreValue(value: number | null): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
