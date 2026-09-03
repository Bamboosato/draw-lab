import type { Tournament } from "../domain/types";
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";
import { isTournamentDrawCurrent, validateTournamentForUi } from "./tournamentModel";

export const TOURNAMENT_STEPS = [
  { key: "basic", label: "基本情報", path: "edit/basic" },
  { key: "entrants", label: "名簿入力", path: "edit/entrants" },
  { key: "options", label: "オプション設定", path: "edit/options" },
  { key: "matches", label: "対戦カード", path: "edit/matches" },
  { key: "preview", label: "生成・プレビュー", path: "preview" },
] as const;

export type TournamentStep = (typeof TOURNAMENT_STEPS)[number]["key"];
export type TournamentEditStep = Exclude<TournamentStep, "preview">;

export type StepAccess = {
  canEnter: boolean;
  reason?: string;
  redirectStep?: TournamentStep;
};

export function getTournamentStepPath(tournamentId: string, step: TournamentStep): string {
  const definition = TOURNAMENT_STEPS.find((item) => item.key === step);
  return `/tournaments/${tournamentId}/${definition?.path ?? "edit/basic"}`;
}

export function getTournamentEditSteps(tournament: Tournament): readonly TournamentEditStep[] {
  return tournament.generatedDraw
    ? ["basic", "entrants", "options", "matches"]
    : ["basic"];
}

export function getTournamentStepFromPath(pathname: string): TournamentStep | undefined {
  if (pathname.includes("/edit/entrants")) {
    return "entrants";
  }

  if (pathname.includes("/edit/options")) {
    return "options";
  }

  if (pathname.includes("/edit/matches")) {
    return "matches";
  }

  if (pathname.includes("/preview")) {
    return "preview";
  }

  if (pathname.includes("/edit/basic")) {
    return "basic";
  }

  return undefined;
}

export function getBasicInfoErrors(tournament: Tournament): string[] {
  const errors: string[] = [];

  if (tournament.seedCount < 0) {
    errors.push("シード数は0以上にしてください。");
  }

  if (tournament.seedCount > tournament.drawSize) {
    errors.push("シード数はドローサイズ以下にしてください。");
  }

  return errors;
}

export function isTournamentStepComplete(
  tournament: Tournament,
  step: TournamentStep,
  integration?: TournamentIntegrationRecord,
): boolean {
  switch (step) {
    case "basic":
      return isBasicInfoComplete(tournament);
    case "entrants":
      return isRosterComplete(tournament, integration);
    case "options":
    case "matches":
    case "preview":
      return isTournamentDrawCurrent(tournament, integration);
  }
}

export function getTournamentStepAccess(
  tournament: Tournament,
  step: TournamentStep,
  integration?: TournamentIntegrationRecord,
): StepAccess {
  if (step === "basic") {
    return { canEnter: true };
  }

  if (!isBasicInfoComplete(tournament)) {
    return {
      canEnter: false,
      reason: "基本情報を完了してから次のステップへ進んでください。",
      redirectStep: "basic",
    };
  }

  if (step === "entrants") {
    return { canEnter: true };
  }

  if (!isRosterComplete(tournament, integration)) {
    return {
      canEnter: false,
      reason: "名簿入力を完了してからオプション設定へ進んでください。",
      redirectStep: "entrants",
    };
  }

  if (step === "options") {
    return { canEnter: true };
  }

  if (!isTournamentDrawCurrent(tournament, integration)) {
    return {
      canEnter: false,
      reason: tournament.generatedDraw
        ? "入力内容が生成時から変更されています。設定を元に戻すか、再生成してください。"
        : step === "matches"
          ? "トーナメント表を生成してから対戦カードへ進んでください。"
          : "トーナメント表を生成してからプレビューへ進んでください。",
      redirectStep: "options",
    };
  }

  return { canEnter: true };
}

function isBasicInfoComplete(tournament: Tournament): boolean {
  return getBasicInfoErrors(tournament).length === 0;
}

function isRosterComplete(tournament: Tournament, integration?: TournamentIntegrationRecord): boolean {
  return validateTournamentForUi(tournament, integration).errors.length === 0;
}
