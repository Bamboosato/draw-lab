// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLeaguePrintFilename, buildTournamentPrintFilename, printWithFilename } from "../utils/print";

const printMock = vi.fn();

beforeEach(() => {
  document.title = "Draw Lab";
  printMock.mockReset();
  window.print = printMock;
});

afterEach(() => {
  document.title = "";
});

describe("print filenames", () => {
  it("大会名をトーナメント表の既定ファイル名へ変換する", () => {
    expect(buildTournamentPrintFilename("春季大会")).toBe("春季大会_トーナメント表");
    expect(buildTournamentPrintFilename("  ")).toBe("トーナメント_トーナメント表");
  });

  it("大会名とグループ名をリーグ表の既定ファイル名へ変換する", () => {
    expect(buildLeaguePrintFilename("春季大会", "A")).toBe("春季大会_リーグ表-グループA");
    expect(buildLeaguePrintFilename(undefined, "B")).toBe("リーグ_リーグ表-グループB");
  });

  it("印刷中だけ既定ファイル名をタイトルへ設定し、印刷後に戻す", () => {
    printWithFilename("春季大会_リーグ表-グループA");

    expect(document.title).toBe("春季大会_リーグ表-グループA");
    expect(printMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("afterprint"));

    expect(document.title).toBe("Draw Lab");
  });
});
