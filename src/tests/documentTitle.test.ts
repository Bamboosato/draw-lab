import { describe, expect, it } from "vitest";
import { getDocumentTitle } from "../app/documentTitle";

describe("getDocumentTitle", () => {
  it("大会名がある場合はDrawLabと大会名を表示する", () => {
    expect(getDocumentTitle("春季大会")).toBe("DrawLab　＞春季大会");
  });

  it("大会名の前後の空白を除いて表示する", () => {
    expect(getDocumentTitle("  春季大会  ")).toBe("DrawLab　＞春季大会");
  });

  it.each([undefined, "", "   "]) ("大会名が未入力の場合はDrawLabだけを表示する: %s", (title) => {
    expect(getDocumentTitle(title)).toBe("DrawLab");
  });
});
