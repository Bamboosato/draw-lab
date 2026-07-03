import type { Tournament } from "../domain/types";
import { validateTournamentForUi } from "./tournamentModel";

export const TOURNAMENT_STEPS = [
  { key: "basic", label: "基本情報", path: "edit/basic" },
  { key: "entrants", label: "名簿入力", path: "edit/entrants" },
  { key: "options", label: "トーナメント生成", path: "edit/options" },
  { key: "preview", label: "プレビュー", path: "preview" },
] as const;

export type TournamentStep = (typeof TOURNAMENT_STEPS)[number]["key"];

export type StepAccess = {
  canEnter: boolean;
  reason?: string;
  redirectStep?: TournamentStep;
};

export function getTournamentStepPath(tournamentId: string, step: TournamentStep): string {
  const definition = TOURNAMENT_STEPS.find((item) => item.key === step);
  return `/tournaments/${tournamentId}/${definition?.path ?? "edit/basic"}`;
}

export function getTournamentStepFromPath(pathname: string): TournamentStep | undefined {
  if (pathname.includes("/edit/entrants")) {
    return "entrants";
  }

  if (pathname.includes("/edit/options")) {
    return "options";
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

export function isTournamentStepComplete(tournament: Tournament, step: TournamentStep): boolean {
  switch (step) {
    case "basic":
      return isBasicInfoComplete(tournament);
    case "entrants":
      return isRosterComplete(tournament);
    case "options":
    case "preview":
      return Boolean(tournament.generatedDraw);
  }
}

export function getTournamentStepAccess(tournament: Tournament, step: TournamentStep): StepAccess {
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

  if (!isRosterComplete(tournament)) {
    return {
      canEnter: false,
      reason: "名簿入力を完了してからトーナメント生成へ進んでください。",
      redirectStep: "entrants",
    };
  }

  if (step === "options") {
    return { canEnter: true };
  }

  if (!tournament.generatedDraw) {
    return {
      canEnter: false,
      reason: "トーナメント表を生成してからプレビューへ進んでください。",
      redirectStep: "options",
    };
  }

  return { canEnter: true };
}

function isBasicInfoComplete(tournament: Tournament): boolean {
  return getBasicInfoErrors(tournament).length === 0;
}

function isRosterComplete(tournament: Tournament): boolean {
  return validateTournamentForUi(tournament).errors.length === 0;
}
