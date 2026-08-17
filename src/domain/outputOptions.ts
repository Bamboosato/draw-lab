import type { DrawOutputOptions, DrawSize, OutputPageCount } from "./types";

export const OUTPUT_PAGE_COUNTS: OutputPageCount[] = [1, 2, 4, 8, 16, 32];

export const DEFAULT_DRAW_OUTPUT_OPTIONS: DrawOutputOptions = {
  bracketLayout: "singleSide",
  outputPageCount: 1,
  rightSideDrawNumberPosition: "right",
  seedNumberPosition: "outer",
  lineWeight: "normal",
  teamNameBrackets: false,
  textAlign: "default",
};

export function getDrawOutputOptions(value: unknown): DrawOutputOptions {
  return normalizeDrawOutputOptions(value);
}

export function normalizeDrawOutputOptions(value: unknown): DrawOutputOptions {
  if (!isRecord(value)) {
    return { ...DEFAULT_DRAW_OUTPUT_OPTIONS };
  }

  return {
    bracketLayout: value.bracketLayout === "bothSides" ? "bothSides" : DEFAULT_DRAW_OUTPUT_OPTIONS.bracketLayout,
    outputPageCount: isOutputPageCount(value.outputPageCount)
      ? value.outputPageCount
      : DEFAULT_DRAW_OUTPUT_OPTIONS.outputPageCount,
    rightSideDrawNumberPosition: value.rightSideDrawNumberPosition === "left"
      ? "left"
      : DEFAULT_DRAW_OUTPUT_OPTIONS.rightSideDrawNumberPosition,
    seedNumberPosition: value.seedNumberPosition === "inner" || value.seedNumberPosition === "right"
      ? "inner"
      : DEFAULT_DRAW_OUTPUT_OPTIONS.seedNumberPosition,
    lineWeight: value.lineWeight === "thin"
      || value.lineWeight === "bold"
      || value.lineWeight === "extraBold"
      ? value.lineWeight
      : DEFAULT_DRAW_OUTPUT_OPTIONS.lineWeight,
    teamNameBrackets: typeof value.teamNameBrackets === "boolean"
      ? value.teamNameBrackets
      : DEFAULT_DRAW_OUTPUT_OPTIONS.teamNameBrackets,
    textAlign: value.textAlign === "center" || value.textAlign === "distributed"
      ? value.textAlign
      : DEFAULT_DRAW_OUTPUT_OPTIONS.textAlign,
  };
}

export function getAvailableOutputPageCounts(drawSize: DrawSize): OutputPageCount[] {
  const maximumPageCount = Math.max(1, drawSize / 4);
  return OUTPUT_PAGE_COUNTS.filter((pageCount) => pageCount <= maximumPageCount);
}

export function getEffectiveOutputPageCount(
  outputPageCount: OutputPageCount,
  drawSize: DrawSize,
  bracketLayout: DrawOutputOptions["bracketLayout"],
): OutputPageCount {
  if (bracketLayout === "singleSide") {
    return 1;
  }

  const availablePageCounts = getAvailableOutputPageCounts(drawSize);
  return [...availablePageCounts]
    .reverse()
    .find((pageCount) => pageCount <= outputPageCount) ?? 1;
}

function isOutputPageCount(value: unknown): value is OutputPageCount {
  return typeof value === "number" && OUTPUT_PAGE_COUNTS.includes(value as OutputPageCount);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
