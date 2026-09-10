import { describe, expect, it } from "vitest";
import { parseTournamentImport } from "../app/tournamentPersistence";
import {
  getBothSideJoinCenterY,
  getBothSideJoinPath,
  getBothSideRowGroups,
  getColumnTextLayout,
  getDistributedTextLayout,
  getPrintPageBrackets,
  getPrintPageMatches,
  getPrintPageScoreDisplays,
  getRoundConnectorPath,
  getSingleSideFinalConnectorPath,
  getSlotContentLayout,
  getSlotWidth,
  isSeedOnLeft,
} from "../components/DrawPreview";
import {
  DEFAULT_DRAW_OUTPUT_OPTIONS,
  getAvailableOutputPageCounts,
  getEffectiveOutputPageCount,
  normalizeDrawOutputOptions,
} from "../domain/outputOptions";

describe("draw output options", () => {
  it("uses the documented defaults for missing output options", () => {
    expect(normalizeDrawOutputOptions(undefined)).toEqual(DEFAULT_DRAW_OUTPUT_OPTIONS);
  });

  it("coerces invalid imported values field by field", () => {
    expect(normalizeDrawOutputOptions({
      bracketLayout: "invalid",
      outputPageCount: 3,
      rightSideDrawNumberPosition: "left",
      seedNumberPosition: "invalid",
      lineWeight: "extraBold",
      teamNameBrackets: "yes",
      textAlign: "center",
    })).toEqual({
      ...DEFAULT_DRAW_OUTPUT_OPTIONS,
      rightSideDrawNumberPosition: "left",
      lineWeight: "extraBold",
      textAlign: "center",
    });
  });

  it("keeps a supported output page count", () => {
    expect(normalizeDrawOutputOptions({ outputPageCount: 4 }).outputPageCount).toBe(4);
  });

  it.each([
    [4, [1]],
    [8, [1, 2]],
    [16, [1, 2, 4]],
    [32, [1, 2, 4, 8]],
    [64, [1, 2, 4, 8, 16]],
    [128, [1, 2, 4, 8, 16, 32]],
  ] as const)("limits page counts to complete first-round pairs for a %i draw", (drawSize, expected) => {
    expect(getAvailableOutputPageCounts(drawSize)).toEqual(expected);
  });

  it("uses one page for a single-side draw and clamps an excessive both-side count", () => {
    expect(getEffectiveOutputPageCount(4, 16, "singleSide")).toBe(1);
    expect(getEffectiveOutputPageCount(32, 16, "bothSides")).toBe(4);
  });

  it("converts legacy absolute seed positions to outer and inner", () => {
    expect(normalizeDrawOutputOptions({ seedNumberPosition: "left" }).seedNumberPosition).toBe("outer");
    expect(normalizeDrawOutputOptions({ seedNumberPosition: "right" }).seedNumberPosition).toBe("inner");
  });

  it("fills defaults when an older tournament backup has no output options", () => {
    const result = parseTournamentImport(JSON.stringify({
      matchType: "singles",
      drawSize: 4,
      seedCount: 0,
      entrants: [],
      options: {},
    }));

    expect(result.state).toBe("success");
    if (result.state === "success") {
      expect(result.tournament.outputOptions).toEqual(DEFAULT_DRAW_OUTPUT_OPTIONS);
    }
  });

  it("uses the available width when the required spacing stays within one character", () => {
    const layout = getDistributedTextLayout("東京都市大学附属", 100, 150, 13);

    expect(layout).toMatchObject({
      x: 100,
      textAnchor: "start",
      textLength: 150,
      lengthAdjust: "spacing",
    });
  });

  it("caps the added spacing at one character width for short labels", () => {
    const layout = getDistributedTextLayout("東京", 100, 100, 13);

    expect(layout.textLength).toBe(39);
    expect(layout.lengthAdjust).toBe("spacing");
  });

  it("compresses long labels rather than allowing them to overflow the slot", () => {
    const layout = getDistributedTextLayout("東京都市大学附属高等学校", 100, 80, 13);

    expect(layout.textLength).toBe(80);
    expect(layout.lengthAdjust).toBe("spacingAndGlyphs");
  });

  it("does not add spacing to a one-character label", () => {
    expect(getDistributedTextLayout("A", 100, 100, 13)).toEqual({
      x: 100,
      textAnchor: "start",
    });
  });

  it("packs the draw number and outer seed from the left on the left side", () => {
    expect(getSlotContentLayout(16, 240, "left", {
      rightSideDrawNumberPosition: "right",
      seedNumberPosition: "outer",
    }, true)).toEqual({
      drawNumberX: 28,
      drawNumberAnchor: "start",
      seedX: 48,
      seedOnLeft: true,
      content: { startX: 94, endX: 244 },
    });
  });

  it("packs the draw number and outer seed from the right on the right side", () => {
    expect(getSlotContentLayout(16, 240, "right", {
      rightSideDrawNumberPosition: "right",
      seedNumberPosition: "outer",
    }, true)).toEqual({
      drawNumberX: 244,
      drawNumberAnchor: "end",
      seedX: 186,
      seedOnLeft: false,
      content: { startX: 28, endX: 178 },
    });
  });

  it("moves the right-side inner seed to the left of the content", () => {
    expect(getSlotContentLayout(16, 240, "right", {
      rightSideDrawNumberPosition: "right",
      seedNumberPosition: "inner",
    }, true)).toEqual({
      drawNumberX: 244,
      drawNumberAnchor: "end",
      seedX: 28,
      seedOnLeft: true,
      content: { startX: 74, endX: 224 },
    });
  });

  it("does not reserve seed space when the draw has no seeds", () => {
    expect(getSlotContentLayout(16, 240, "left", {
      rightSideDrawNumberPosition: "right",
      seedNumberPosition: "outer",
    }, false)).toEqual({
      drawNumberX: 28,
      drawNumberAnchor: "start",
      seedX: 48,
      seedOnLeft: true,
      content: { startX: 48, endX: 244 },
    });
  });

  it("fits a doubles label inside its column when the label is wider", () => {
    expect(getColumnTextLayout("チーム5-1", 100, 144, "default", 12)).toEqual({
      x: 100,
      textAnchor: "start",
      textLength: 44,
      lengthAdjust: "spacingAndGlyphs",
    });
  });

  it("uses the compact minimum card width for short singles labels", () => {
    expect(getSlotWidth({
      matchType: "singles",
      drawSize: 4,
      outputOptions: DEFAULT_DRAW_OUTPUT_OPTIONS,
      matches: [],
      scoreDisplays: [],
      rows: [{ position: 1, label: "A", isBye: false }],
    })).toBe(210);
  });

  it("keeps a common doubles card compact", () => {
    expect(getSlotWidth({
      matchType: "doubles",
      drawSize: 4,
      outputOptions: DEFAULT_DRAW_OUTPUT_OPTIONS,
      matches: [],
      scoreDisplays: [],
      rows: [{
        position: 1,
        label: "チーム5-1 / チーム5-2",
        player1Label: "チーム5-1",
        player2Label: "チーム5-2",
        seedNo: 1,
        team1Label: "(静岡)",
        team2Label: "(愛知)",
        isBye: false,
      }],
    })).toBe(240);
  });

  it("caps the card width for very long doubles labels", () => {
    expect(getSlotWidth({
      matchType: "doubles",
      drawSize: 4,
      outputOptions: DEFAULT_DRAW_OUTPUT_OPTIONS,
      matches: [],
      scoreDisplays: [],
      rows: [{
        position: 1,
        label: "東京都市大学附属高等学校 / 神奈川県立総合高等学校",
        player1Label: "東京都市大学附属高等学校",
        player2Label: "神奈川県立総合高等学校",
        seedNo: 1,
        team1Label: "(東京都市大学附属高等学校)",
        team2Label: "(神奈川県立総合高等学校)",
        isBye: false,
      }],
    })).toBe(280);
  });

  it("resolves outer and inner seed positions per side", () => {
    expect(isSeedOnLeft("left", "outer")).toBe(true);
    expect(isSeedOnLeft("left", "inner")).toBe(false);
    expect(isSeedOnLeft("right", "outer")).toBe(false);
    expect(isSeedOnLeft("right", "inner")).toBe(true);
    expect(isSeedOnLeft("single", "outer")).toBe(true);
  });

  it.each([
    [4, 69],
    [8, 123],
    [16, 231],
  ])("centers the both-side join with the semifinal lines for %i draws", (drawSize, expectedCenterY) => {
    expect(getBothSideJoinCenterY(drawSize)).toBe(expectedCenterY);
  });

  it("joins both sides with equal horizontal halves and an upward stem", () => {
    expect(getBothSideJoinPath(100, 148, 200)).toBe("M 100 200 H 148 M 124 200 V 176");
  });

  it.each([
    [100, 124, "M 100 50 H 124 V 100 H 100"],
    [124, 100, "M 124 50 H 100 V 100 H 124"],
  ])("keeps each round connector at the entrant-card horizontal length", (sourceX, targetX, expected) => {
    expect(getRoundConnectorPath(sourceX, targetX, 50, 100)).toBe(expected);
  });

  it("adds one horizontal connector from the single-side final line toward the winner", () => {
    expect(getSingleSideFinalConnectorPath(196, 231)).toBe("M 196 231 H 220");
  });

  it("keeps the right-side draw numbers in ascending top-to-bottom order", () => {
    const rows = Array.from({ length: 16 }, (_, index) => ({
      position: index + 1,
      label: `選手${index + 1}`,
      isBye: false,
    }));

    const { leftRows, rightRows } = getBothSideRowGroups(rows, 16);

    expect(leftRows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rightRows.map((row) => row.position)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("builds independent both-side brackets from consecutive draw-number ranges", () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({
      position: index + 1,
      label: `選手${index + 1}`,
      isBye: false,
    }));

    const pages = getPrintPageBrackets(rows, 32, 2);
    const firstPage = getBothSideRowGroups(pages[0].rows, pages[0].drawSize);
    const secondPage = getBothSideRowGroups(pages[1].rows, pages[1].drawSize);

    expect(pages.map((page) => page.drawSize)).toEqual([16, 16]);
    expect(firstPage.leftRows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(firstPage.rightRows.map((row) => row.position)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(secondPage.leftRows.map((row) => row.position)).toEqual([17, 18, 19, 20, 21, 22, 23, 24]);
    expect(secondPage.rightRows.map((row) => row.position)).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);
  });

  it("falls back to one print bracket for an unsupported page count", () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({
      position: index + 1,
      label: `選手${index + 1}`,
      isBye: false,
    }));

    expect(getPrintPageBrackets(rows, 32, 3)).toEqual([{ drawSize: 32, rows }]);
  });

  it("remaps winner matches to the local numbering of each print page", () => {
    const matches = [
      { id: "r1-1", round: 1, matchNo: 1 },
      { id: "r1-2", round: 1, matchNo: 2 },
      { id: "r1-3", round: 1, matchNo: 3 },
      { id: "r1-4", round: 1, matchNo: 4 },
      { id: "r2-1", round: 2, matchNo: 1 },
      { id: "r2-2", round: 2, matchNo: 2 },
      { id: "r3-1", round: 3, matchNo: 1 },
    ].map((match) => ({
      ...match,
      sourceA: { slotPosition: 1 } as const,
      sourceB: { slotPosition: 2 } as const,
      result: "unplayed" as const,
      state: "ready" as const,
    }));

    const pageMatches = getPrintPageMatches(matches, 4, 1);
    expect(pageMatches.map((match) => [match.id, match.round, match.matchNo])).toEqual([
      ["r1-3", 1, 1],
      ["r1-4", 1, 2],
      ["r2-2", 2, 1],
    ]);
    expect(getPrintPageScoreDisplays([
      { matchId: "r1-1", mode: "winner-loser-games", winnerValue: 6, loserValue: 3 },
      { matchId: "r1-3", mode: "winner-loser-games", winnerValue: 7, loserValue: 5 },
    ], pageMatches)).toEqual([
      { matchId: "r1-3", mode: "winner-loser-games", winnerValue: 7, loserValue: 5 },
    ]);
  });
});
