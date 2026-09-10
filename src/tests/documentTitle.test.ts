import { describe, expect, it } from "vitest";
import { getDocumentTitle } from "../app/documentTitle";

describe("getDocumentTitle", () => {
  it("大会編集中・表示中は種別、大会名、状態を表示する", () => {
    expect(getDocumentTitle("トーナメント", "春季大会", "編集中")).toBe("DrawLab　トーナメント＞春季大会｜編集中");
    expect(getDocumentTitle("リーグ", "春季大会", "運用中")).toBe("DrawLab　リーグ＞春季大会｜運用中");
  });

  it("大会名の前後の空白を除いて表示する", () => {
    expect(getDocumentTitle("トーナメント", "  春季大会  ", "完了")).toBe("DrawLab　トーナメント＞春季大会｜完了");
  });

  it.each([
    ["トーナメント", "DrawLab　トーナメント"],
    ["リーグ", "DrawLab　リーグ"],
  ] as const)("一覧表示中は種別だけを表示する: %s", (competition, expected) => {
    expect(getDocumentTitle(competition)).toBe(expected);
  });

  it("大会名未入力の編集中画面でも種別と状態を表示する", () => {
    expect(getDocumentTitle("トーナメント", "   ", "編集中")).toBe("DrawLab　トーナメント｜編集中");
  });

  it("ホームではDrawLabだけを表示する", () => {
    expect(getDocumentTitle()).toBe("DrawLab");
  });
});
