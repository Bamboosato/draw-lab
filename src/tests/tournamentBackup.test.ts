import { describe, expect, it } from "vitest";
import type { Tournament } from "../domain/types";
import { isTournamentDrawCurrent } from "../app/tournamentModel";
import { createLeagueToTournament } from "../app/leagueTournamentAdapter";
import { createDefaultLeague } from "../app/leagueModel";
import {
  parseJsonImport,
  serializeAllTournaments,
  serializeTournament,
} from "../app/tournamentPersistence";

describe("tournament JSON backup", () => {
  it("imports an individual tournament with new IDs and remapped draw references", () => {
    const base = createTournament("source");
    const source = {
      ...base,
      entrants: [
        ...base.entrants,
        { id: "source-blank", player1Name: "", team1: "", region: "" },
      ],
    };
    const result = parseJsonImport(
      serializeTournament(source, "2026-02-01T00:00:00.000Z"),
      "2026-02-02T00:00:00.000Z",
    );

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "tournament") {
      return;
    }

    expect(result.tournament.id).not.toBe(source.id);
    expect(result.tournament.entrants[0].id).not.toBe(source.entrants[0].id);
    expect(result.tournament.entrants).toHaveLength(2);
    expect(result.tournament.entrants[1]).toMatchObject({ player1Name: "", team1: "", region: "" });
    expect(result.tournament.entrants[1].id).not.toBe(source.entrants[1].id);
    expect(result.tournament.generatedDraw?.tournamentId).toBe(result.tournament.id);
    expect(result.tournament.generatedDraw?.slots[0].entrantId).toBe(result.tournament.entrants[0].id);
    expect(result.tournament.generatedDraw?.generationInputSignature).toBeDefined();
    expect(isTournamentDrawCurrent(result.tournament)).toBe(true);
    expect(result.tournament.createdAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("imports a stale individual draw as ungenerated", () => {
    const source = createTournament("stale-source");
    source.generatedDraw = {
      ...source.generatedDraw!,
      generationInputSignature: "stale-signature",
    };

    const result = parseJsonImport(serializeTournament(source), "2026-02-02T00:00:00.000Z");

    expect(result).toMatchObject({ state: "success", kind: "tournament" });
    if (result.state !== "success" || result.kind !== "tournament") {
      return;
    }

    expect(result.tournament.generatedDraw).toBeUndefined();
    expect(isTournamentDrawCurrent(result.tournament)).toBe(false);
  });

  it("parses a full backup without changing IDs or timestamps", () => {
    const source = createTournament("source");
    const result = parseJsonImport(serializeAllTournaments([source], "2026-02-01T00:00:00.000Z"));

    expect(result).toMatchObject({ state: "success", kind: "backup" });
    if (result.state !== "success" || result.kind !== "backup") {
      return;
    }

    expect(result.backup.exportedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(result.backup.tournaments[0]).toMatchObject({
      id: source.id,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      generatedDraw: {
        id: source.generatedDraw?.id,
        tournamentId: source.id,
      },
    });
  });

  it("accepts an empty full backup as an explicit zero-record replacement", () => {
    const result = parseJsonImport(serializeAllTournaments([], "2026-02-01T00:00:00.000Z"));

    expect(result).toMatchObject({
      state: "success",
      kind: "backup",
      backup: { tournaments: [] },
    });
  });

  it("rejects unsupported schemas, duplicate IDs, and invalid draw references", () => {
    const source = createTournament("source");
    const unsupported = JSON.stringify({ schemaVersion: 2, exportedAt: "now", tournaments: [] });
    const duplicate = serializeAllTournaments([source, source]);
    const invalidReference = serializeAllTournaments([{
      ...source,
      generatedDraw: {
        ...source.generatedDraw!,
        slots: [{ position: 1, entrantId: "missing", isBye: false }],
      },
    }]);

    expect(parseJsonImport(unsupported)).toMatchObject({ state: "error", code: "BACKUP_SCHEMA_UNSUPPORTED" });
    expect(parseJsonImport(duplicate)).toMatchObject({ state: "error", code: "BACKUP_DUPLICATE_ID" });
    expect(parseJsonImport(invalidReference)).toMatchObject({ state: "error", code: "BACKUP_REFERENCE_INVALID" });
  });

  it("reports malformed JSON without treating it as an empty backup", () => {
    expect(parseJsonImport("{ broken")).toMatchObject({ state: "error", code: "JSON_PARSE_ERROR" });
  });

  it("accepts a legacy individual wrapper without a schema and rejects unknown JSON", () => {
    const legacy = parseJsonImport(JSON.stringify({ tournament: createTournament("legacy") }));

    expect(legacy).toMatchObject({ state: "success", kind: "tournament" });
    expect(parseJsonImport(JSON.stringify({ hello: "world" }))).toMatchObject({
      state: "error",
      code: "IMPORT_KIND_UNKNOWN",
    });
  });

  it("round-trips team names, members, and affiliations", () => {
    const source = {
      ...createTournament("team-source"),
      matchType: "team" as const,
      entrants: [{
        id: "team-source-entrant",
        player1Name: "",
        teamName: "Team A",
        memberNames: ["Member A", "Member B"],
        team1: "Affiliation A",
        region: "East",
        ranking: 1,
      }],
      generatedDraw: {
        ...createTournament("team-source").generatedDraw!,
        slots: [{ position: 1, entrantId: "team-source-entrant", isBye: false }],
      },
    };
    const result = parseJsonImport(serializeTournament(source));

    expect(result).toMatchObject({ state: "success", kind: "tournament" });
    if (result.state !== "success" || result.kind !== "tournament") {
      return;
    }

    expect(result.tournament.matchType).toBe("team");
    expect(result.tournament.entrants[0]).toMatchObject({
      teamName: "Team A",
      memberNames: ["Member A", "Member B"],
      team1: "Affiliation A",
    });
    expect(isTournamentDrawCurrent(result.tournament)).toBe(true);
  });

  it("round-trips league source, rank range, and manual placement metadata with remapped IDs", () => {
    const league = {
      ...createDefaultLeague(),
      id: "league-source",
      participantType: "team" as const,
      participants: [{
        id: "league-participant",
        displayName: "Team A",
        participantType: "team" as const,
        memberNames: ["A1"],
        team: "Affiliation",
        selectionStatus: "selected" as const,
      }],
      selection: { mode: "all" as const, selectedParticipantIds: ["league-participant"], reserveParticipantIds: [] },
      matchSelectionStatus: "confirmed" as const,
    };
    const linked = createLeagueToTournament({ ...createTournament("linked-source"), matchType: "team", entrants: [] }, league, { min: 1, max: 1 });
    const text = serializeTournament(linked.tournament, "2026-02-01T00:00:00.000Z", linked.integration);
    const result = parseJsonImport(text, "2026-02-02T00:00:00.000Z");

    expect(result.state).toBe("success");
    if (result.state !== "success" || result.kind !== "tournament") return;
    expect(result.integration?.source.leagueId).toBe("league-source");
    expect(result.integration?.rankRange).toEqual({ min: 1, max: 1 });
    expect(result.integration?.participants[0]?.tournamentEntrantId).toBe(result.tournament.entrants[0]?.id);
    expect(result.integration?.participants[0]?.tournamentEntrantId).not.toBe(linked.integration.participants[0]?.tournamentEntrantId);
  });
});

function createTournament(id: string): Tournament {
  const entrantId = `${id}-entrant`;
  return {
    id,
    title: id,
    matchType: "singles",
    drawSize: 4,
    seedCount: 0,
    entrants: [{ id: entrantId, player1Name: "選手A" }],
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
    },
    generatedDraw: {
      id: `${id}-draw`,
      tournamentId: id,
      randomSeed: "seed",
      slots: [{ position: 1, entrantId, isBye: false }],
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
