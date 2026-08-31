import type { League } from "../domain/leagueTypes";
import { hasLeagueResults, isLeagueParticipantEmpty, validateLeague, validateManualRanks } from "../domain/leagueLogic";

export const LEAGUE_STEPS = [
  { key: "basic", label: "基本情報", path: "edit/basic" },
  { key: "participants", label: "名簿入力・選出", path: "edit/participants" },
  { key: "groups", label: "グループ設定", path: "edit/groups" },
  { key: "matches", label: "対戦カード", path: "edit/matches" },
  { key: "dashboard", label: "リーグ表", path: "dashboard" },
] as const;

export type LeagueStep = (typeof LEAGUE_STEPS)[number]["key"];
export type LeagueEditStep = Exclude<LeagueStep, "dashboard">;

export function getLeagueStepPath(id: string, step: LeagueStep): string {
  const definition = LEAGUE_STEPS.find((item) => item.key === step);
  return `/leagues/${id}/${definition?.path ?? "edit/basic"}`;
}

export function getLeagueEditSteps(league: League): readonly LeagueEditStep[] {
  if (league.status === "completed") {
    return [];
  }

  const steps: LeagueEditStep[] = ["basic"];
  const hasEnteredParticipants = league.participants.some((participant) => !isLeagueParticipantEmpty(participant));

  if (hasEnteredParticipants || league.selection.selectedParticipantIds.length > 0) {
    steps.push("participants");
  }
  if (league.groups.length > 0) {
    steps.push("groups");
  }
  if (league.matches.length > 0 || league.matchSelectionStatus === "confirmed") {
    steps.push("matches");
  }

  return steps;
}

export function getLeagueStepFromPath(pathname: string): LeagueStep | undefined {
  if (pathname.includes("/selection")) return "participants";
  for (const step of LEAGUE_STEPS) {
    if (pathname.includes(`/${step.path}`)) return step.key;
  }
  return undefined;
}

export function getLeagueStepAccess(league: League, step: LeagueStep): { canEnter: boolean; reason?: string; redirectStep?: LeagueStep } {
  if (league.status === "completed" && step !== "dashboard") {
    return { canEnter: false, reason: "完了済みリーグは読み取り専用です。編集を再開する場合はリーグ表から操作してください。", redirectStep: "dashboard" };
  }
  if (step === "basic") return { canEnter: true };
  if (!Number.isInteger(league.capacity) || league.capacity < 1) return { canEnter: false, reason: "基本情報を完了してから次のステップへ進んでください。", redirectStep: "basic" };
  if (step === "participants") return { canEnter: true };
  if (validateParticipants(league).length > 0) return { canEnter: false, reason: "名簿入力を完了してから選出へ進んでください。", redirectStep: "participants" };
  if (league.selection.selectedParticipantIds.length < 1) return { canEnter: false, reason: "選出者を決めてからグループ設定へ進んでください。", redirectStep: "participants" };
  if (step === "groups") return { canEnter: true };
  if (league.groups.length === 0) return { canEnter: false, reason: "グループを作成してから対戦カードへ進んでください。", redirectStep: "groups" };
  if (step === "matches") return { canEnter: true };
  if (league.matchSelectionStatus !== "confirmed") return { canEnter: false, reason: "対戦カードを確定してからリーグ表へ進んでください。", redirectStep: "matches" };
  return { canEnter: true };
}

export function getLeagueStepCompletion(league: League, step: LeagueStep): boolean {
  switch (step) {
    case "basic": return Number.isInteger(league.capacity) && league.capacity > 0;
    case "participants": return validateParticipants(league).length === 0 && league.selection.selectedParticipantIds.length > 0;
    case "groups": return league.groups.length > 0;
    case "matches": return league.matchSelectionStatus === "confirmed";
    case "dashboard": return league.status === "completed";
  }
}

export function validateParticipants(league: League) {
  return validateLeague(league).errors.filter((issue) => issue.code === "PARTICIPANT_REQUIRED" || issue.code === "PARTICIPANT_NAME_REQUIRED" || issue.code === "DOUBLES_MEMBER_COUNT" || issue.code === "TEAM_MEMBER_COUNT");
}

export function canCompleteLeague(league: League): boolean {
  return !hasLeagueResults(league) || validateManualRanks(league).errors.length === 0;
}
