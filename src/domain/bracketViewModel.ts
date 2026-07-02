import type { BracketRow, BracketViewModel, Entrant, GeneratedDraw, Tournament } from "./types";
import { normalizeTournament } from "./validation";

export function buildBracketViewModel(tournament: Tournament, draw: GeneratedDraw): BracketViewModel {
  const normalizedTournament = normalizeTournament(tournament);
  const entrantsById = new Map(normalizedTournament.entrants.map((entrant) => [entrant.id, entrant]));
  const rows = [...draw.slots]
    .sort((a, b) => a.position - b.position)
    .map<BracketRow>((slot) => {
      const entrant = slot.entrantId ? entrantsById.get(slot.entrantId) : undefined;

      return {
        position: slot.position,
        label: buildRowLabel(entrant, slot.isBye),
        seedNo: slot.seedNo,
        teamLabel: entrant ? buildTeamLabel(entrant) : undefined,
        region: entrant?.region,
        isBye: slot.isBye,
      };
    });

  return {
    title: normalizedTournament.title,
    date: normalizedTournament.date,
    venue: normalizedTournament.venue,
    eventName: normalizedTournament.eventName,
    drawSize: normalizedTournament.drawSize,
    rows,
  };
}

function buildRowLabel(entrant: Entrant | undefined, isBye: boolean): string {
  if (isBye) {
    return "BYE";
  }

  if (!entrant) {
    return "";
  }

  return [entrant.player1Name, entrant.player2Name].filter(Boolean).join(" / ");
}

function buildTeamLabel(entrant: Entrant): string | undefined {
  if (entrant.sameTeam) {
    return entrant.team1 ?? entrant.team2;
  }

  return [entrant.team1, entrant.team2].filter(Boolean).join(" / ") || undefined;
}
