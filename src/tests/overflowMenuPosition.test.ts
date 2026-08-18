import { describe, expect, it } from "vitest";
import { getOverflowMenuPosition } from "../app/overflowMenuPosition";

describe("getOverflowMenuPosition", () => {
  it("opens below the trigger when enough space is available", () => {
    expect(getOverflowMenuPosition({
      trigger: { top: 80, right: 300, bottom: 120 },
      menuWidth: 184,
      menuHeight: 160,
      viewportWidth: 1000,
      viewportHeight: 700,
    })).toEqual({ top: 126, left: 116, placement: "below" });
  });

  it("opens above the trigger when the bottom edge has insufficient space", () => {
    expect(getOverflowMenuPosition({
      trigger: { top: 300, right: 980, bottom: 340 },
      menuWidth: 184,
      menuHeight: 180,
      viewportWidth: 1000,
      viewportHeight: 400,
    })).toEqual({ top: 114, left: 796, placement: "above" });
  });

  it("keeps an oversized menu inside the viewport so it can scroll", () => {
    expect(getOverflowMenuPosition({
      trigger: { top: 140, right: 250, bottom: 180 },
      menuWidth: 264,
      menuHeight: 600,
      viewportWidth: 240,
      viewportHeight: 300,
    })).toEqual({ top: 8, left: 8, placement: "viewport" });
  });
});
