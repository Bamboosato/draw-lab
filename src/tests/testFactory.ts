import type { DrawSize, Entrant, Tournament } from "../domain/types";

export function makeEntrant(index: number, overrides: Partial<Entrant> = {}): Entrant {
  return {
    id: `entrant-${index}`,
    player1Name: `Player ${index}`,
    team1: `Team ${index}`,
    region: `Region ${index}`,
    ...overrides,
  };
}

export function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  const drawSize = overrides.drawSize ?? 16;

  return {
    id: "tournament-1",
    title: "Test Tournament",
    date: "2026-07-02",
    venue: "Test Venue",
    eventName: "Singles",
    matchType: "singles",
    drawSize,
    seedCount: 0,
    entrants: makeEntrants(drawSize),
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
      seedPositionMode: "jtaRulebook",
      thirdFourthSeedPlacement: "tennisRule",
      fixByePositionOnSeedLottery: true,
      entrantPlacementOrder: "largeTeamFirst",
      randomSeed: "test-seed",
    },
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

export function makeEntrants(count: number): Entrant[] {
  return Array.from({ length: count }, (_, index) => makeEntrant(index + 1));
}

export function makeTournamentWithEntrantCount(count: number, drawSize: DrawSize = 16): Tournament {
  return makeTournament({
    drawSize,
    entrants: makeEntrants(count),
  });
}
