import { describe, expect, it } from "vitest";
import { getDocumentTitle } from "../app/documentTitle";

describe("getDocumentTitle", () => {
  it("大会名と状態がある場合はDrawLab、大会名、状態を表示する", () => {
    expect(getDocumentTitle("春季大会", "編集中")).toBe("DrawLab　＞春季大会｜編集中");
    expect(getDocumentTitle("春季大会", "運用中")).toBe("DrawLab　＞春季大会｜運用中");
  });

  it("大会名の前後の空白を除いて表示する", () => {
    expect(getDocumentTitle("  春季大会  ", "完了")).toBe("DrawLab　＞春季大会｜完了");
  });

  it.each([undefined, "", "   "]) ("大会名が未入力の場合はDrawLabだけを表示する: %s", (title) => {
    expect(getDocumentTitle(title)).toBe("DrawLab");
  });
});
