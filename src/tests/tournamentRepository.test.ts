import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { Tournament } from "../domain/types";
import { createTournamentRepository } from "../storage/tournamentRepository";

describe("TournamentRepository", () => {
  it("saves, lists, gets, and deletes tournaments", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const older = createTournament("older", "2026-01-01T00:00:00.000Z");
    const newer = createTournament("newer", "2026-01-02T00:00:00.000Z");

    await repository.save(older);
    await repository.save(newer);

    expect((await repository.list()).map((item) => item.id)).toEqual(["newer", "older"]);
    expect(await repository.get("older")).toEqual(older);

    await repository.delete("older");
    expect((await repository.list()).map((item) => item.id)).toEqual(["newer"]);
  });

  it("preserves complete blank roster rows when saving and loading", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const tournament = {
      ...createTournament("with-blank-row"),
      entrants: [
        { id: "entrant-active", player1Name: "選手A" },
        { id: "entrant-blank", player1Name: "", team1: "", region: "" },
      ],
    };

    await repository.save(tournament);

    expect((await repository.get(tournament.id))?.entrants).toEqual(tournament.entrants);
  });

  it("preserves the generation input signature when saving and loading", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const tournament: Tournament = {
      ...createTournament("with-generation-signature"),
      generatedDraw: {
        id: "draw-with-generation-signature",
        tournamentId: "with-generation-signature",
        randomSeed: "seed-1",
        slots: [{ position: 1, isBye: true }],
        matches: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
        generationInputSignature: '{"version":1,"drawSize":4}',
      },
    };

    await repository.save(tournament);

    expect((await repository.get(tournament.id))?.generatedDraw?.generationInputSignature)
      .toBe(tournament.generatedDraw?.generationInputSignature);
  });

  it("replaces all records and supports an empty replacement", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    await repository.save(createTournament("existing"));

    await repository.replaceAll([createTournament("restored-1"), createTournament("restored-2")]);
    expect(new Set((await repository.list()).map((item) => item.id))).toEqual(new Set(["restored-1", "restored-2"]));

    await repository.replaceAll([]);
    expect(await repository.list()).toEqual([]);
  });

  it("rejects duplicate replacement IDs before changing existing records", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const existing = createTournament("existing");
    await repository.save(existing);

    await expect(repository.replaceAll([
      createTournament("duplicate"),
      createTournament("duplicate"),
    ])).rejects.toThrow("重複");
    expect(await repository.list()).toEqual([existing]);
  });

  it("aborts the full replacement when a record cannot be cloned", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const existing = createTournament("existing");
    await repository.save(existing);
    const invalid = {
      ...createTournament("invalid"),
      unsupportedValue: () => undefined,
    } as unknown as Tournament;

    await expect(repository.replaceAll([invalid])).rejects.toBeDefined();
    expect(await repository.list()).toEqual([existing]);
  });

  it("stores migration metadata independently from tournaments", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    await repository.setMetadata("migration", true);
    expect(await repository.getMetadata<boolean>("migration")).toBe(true);
  });

  it("duplicates a tournament with new tournament and entrant IDs", async () => {
    const repository = createTournamentRepository(new IDBFactory());
    const source = {
      ...createTournament("source"),
      entrants: [{ id: "source-entrant", player1Name: "選手A" }],
      options: {
        ...createTournament("source").options,
        randomSeed: "generated-seed",
      },
    };
    await repository.save(source);

    const duplicated = await repository.duplicate(source.id);

    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated.entrants[0].id).not.toBe(source.entrants[0].id);
    expect(duplicated.title).toBe("source のコピー");
    expect(duplicated.generatedDraw).toBeUndefined();
    expect(duplicated.options.randomSeed).toBeUndefined();
    expect(await repository.get(duplicated.id)).toEqual(duplicated);
  });
});

function createTournament(id: string, updatedAt = "2026-01-01T00:00:00.000Z"): Tournament {
  return {
    id,
    title: id,
    matchType: "singles",
    drawSize: 4,
    seedCount: 0,
    entrants: [],
    options: {
      avoidSameTeam: true,
      avoidSameRegion: true,
      prioritizeSeedBye: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}
