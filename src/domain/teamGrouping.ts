import type { Entrant } from "./types";

export function areRelatedTeams(a: Entrant, b: Entrant): boolean {
  const aTokens = getTeamRelationTokens(a);
  const bTokens = new Set(getTeamRelationTokens(b));

  return aTokens.some((token) => bTokens.has(token));
}

export function getTeamRelationTokens(entrant: Entrant): string[] {
  return [
    ...getActualTeamTokens(entrant).map((team) => `team:${team}`),
    ...getSameTeamGroupTokens(entrant).map((group) => `group:${group}`),
  ];
}

export function normalizeSameTeamGroup(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getActualTeamTokens(entrant: Entrant): string[] {
  return [entrant.team1, entrant.team2]
    .map((team) => team?.trim())
    .filter((team): team is string => Boolean(team));
}

function getSameTeamGroupTokens(entrant: Entrant): string[] {
  const group = normalizeSameTeamGroup(entrant.sameTeamGroup);
  return group ? [group] : [];
}
