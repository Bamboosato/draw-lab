import type { BracketRow, BracketViewModel, Entrant, GeneratedDraw, Tournament } from "./types";
import { getDrawOutputOptions } from "./outputOptions";
import { resolveTournamentMatches } from "./tournamentMatches";
import { normalizeTournament } from "./validation";

export function buildBracketViewModel(tournament: Tournament, draw: GeneratedDraw): BracketViewModel {
  const normalizedTournament = normalizeTournament(tournament);
  const entrantsById = new Map(normalizedTournament.entrants.map((entrant) => [entrant.id, entrant]));
  const useTeamBrackets = getDrawOutputOptions(tournament.outputOptions).teamNameBrackets;
  const rows = [...draw.slots]
    .sort((a, b) => a.position - b.position)
    .map<BracketRow>((slot) => {
      const entrant = slot.entrantId ? entrantsById.get(slot.entrantId) : undefined;
      const teamLabels = entrant ? buildTeamLabels(entrant, useTeamBrackets) : {};

      return {
        position: slot.position,
        label: buildRowLabel(entrant, normalizedTournament.matchType, slot.isBye),
        player1Label: normalizedTournament.matchType === "team" ? undefined : entrant?.player1Name,
        player2Label: normalizedTournament.matchType === "team" ? undefined : entrant?.player2Name,
        seedNo: slot.seedNo,
        teamLabel: entrant ? buildTeamLabel(entrant, useTeamBrackets) : undefined,
        team1Label: teamLabels.team1Label,
        team2Label: teamLabels.team2Label,
        isBye: slot.isBye,
      };
    });

  const matches = resolveTournamentMatches(draw, normalizedTournament.entrants);
  const finalMatch = matches.find((match) => match.round === Math.log2(normalizedTournament.drawSize));
  const championEntrantId = finalMatch?.winnerEntrantId;

  return {
    title: normalizedTournament.title,
    date: normalizedTournament.date,
    venue: normalizedTournament.venue,
    eventName: normalizedTournament.eventName,
    matchType: normalizedTournament.matchType,
    drawSize: normalizedTournament.drawSize,
    outputOptions: getDrawOutputOptions(tournament.outputOptions),
    rows,
    matches,
    championDrawPosition: championEntrantId
      ? draw.slots.find((slot) => slot.entrantId === championEntrantId)?.position
      : undefined,
  };
}

function buildRowLabel(entrant: Entrant | undefined, matchType: Tournament["matchType"], isBye: boolean): string {
  if (isBye) {
    return "BYE";
  }

  if (!entrant) {
    return "";
  }

  if (matchType === "team") {
    return entrant.teamName ?? "";
  }

  return [entrant.player1Name, entrant.player2Name].filter(Boolean).join(" / ");
}

function buildTeamLabel(entrant: Entrant, useBrackets: boolean): string | undefined {
  const teamLabel = buildRawTeamLabel(entrant);

  if (!teamLabel) {
    return undefined;
  }

  return useBrackets ? `(${teamLabel})` : teamLabel;
}

function buildTeamLabels(
  entrant: Entrant,
  useBrackets: boolean,
): { team1Label?: string; team2Label?: string } {
  if (entrant.sameTeam) {
    return {
      team1Label: formatTeamLabel(entrant.team1 ?? entrant.team2, useBrackets),
    };
  }

  return {
    team1Label: formatTeamLabel(entrant.team1, useBrackets),
    team2Label: formatTeamLabel(entrant.team2, useBrackets),
  };
}

function formatTeamLabel(team: string | undefined, useBrackets: boolean): string | undefined {
  if (!team) {
    return undefined;
  }

  return useBrackets ? `(${team})` : team;
}

function buildRawTeamLabel(entrant: Entrant): string | undefined {
  if (entrant.sameTeam) {
    return entrant.team1 ?? entrant.team2;
  }

  return [entrant.team1, entrant.team2].filter(Boolean).join(" / ") || undefined;
}
