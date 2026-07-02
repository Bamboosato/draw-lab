import { describe, expect, it } from "vitest";
import { createSeededRandom, shuffleWithRandom } from "../domain/random";

describe("seeded random", () => {
  it("returns the same sequence for the same seed", () => {
    const first = createSeededRandom("same-seed");
    const second = createSeededRandom("same-seed");

    expect([first(), first(), first(), first()]).toEqual([second(), second(), second(), second()]);
  });

  it("returns a different sequence for different seeds", () => {
    const first = createSeededRandom("seed-a");
    const second = createSeededRandom("seed-b");

    expect([first(), first(), first(), first()]).not.toEqual([second(), second(), second(), second()]);
  });

  it("shuffles reproducibly with the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6];

    expect(shuffleWithRandom(items, createSeededRandom("shuffle"))).toEqual(
      shuffleWithRandom(items, createSeededRandom("shuffle")),
    );
  });
});
