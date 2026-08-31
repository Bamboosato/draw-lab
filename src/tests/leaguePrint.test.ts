import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import { buildLeagueMatrixPrintPages } from "../domain/leaguePrint";
import type { League, LeagueParticipant } from "../domain/leagueTypes";

describe("buildLeagueMatrixPrintPages", () => {
  it("8名以下は1ページに全列を配置し、名簿No.順を保持する", () => {
    const league = makeLeague(8, ["p8", "p1", "p4", "p2", "p7", "p3", "p6", "p5"]);

    const result = buildLeagueMatrixPrintPages(league, "g1");

    expect(result.error).toBeUndefined();
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].columns.map((participant) => participant.id)).toEqual([
      "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8",
    ]);
    expect(result.pages[0].rows).toHaveLength(8);
    expect(result.pages[0].rows[0].cells).toHaveLength(8);
  });

  it("9名は先頭8列と残り1列の2ページに分割する", () => {
    const result = buildLeagueMatrixPrintPages(makeLeague(9), "g1");

    expect(result.error).toBeUndefined();
    expect(result.pages.map((page) => page.columns.length)).toEqual([8, 1]);
    expect(result.pages.every((page) => page.rows.length === 9)).toBe(true);
    expect(result.pages.map((page) => page.pageCount)).toEqual([2, 2]);
    expect(result.pages[1].columns[0].id).toBe("p9");
  });

  it("16名は8列ずつの2ページに分割する", () => {
    const result = buildLeagueMatrixPrintPages(makeLeague(16), "g1");

    expect(result.pages).toHaveLength(2);
    expect(result.pages.every((page) => page.columns.length === 8 && page.rows.length === 16)).toBe(true);
  });

  it("各ページでは対角セルだけを対角線対象として返し、結果値を含めない", () => {
    const result = buildLeagueMatrixPrintPages(makeLeague(9), "g1");
    const cells = result.pages.flatMap((page) => page.rows.flatMap((row) => row.cells));

    expect(cells.filter((cell) => cell.isDiagonal)).toHaveLength(9);
    expect(cells.every((cell) => Object.keys(cell).sort().join(",") === "isDiagonal,participantId")).toBe(true);
    expect(result.pages[0].rows[0].cells[0].isDiagonal).toBe(true);
    expect(result.pages[0].rows[0].cells[1].isDiagonal).toBe(false);
    expect(result.pages[1].rows[8].cells[0].isDiagonal).toBe(true);
  });

  it("ダブルス・チームの左側見出しは表示名と氏名を改行して括弧なしで返す", () => {
    const league = makeLeague(1);
    league.participants[0] = {
      ...league.participants[0],
      displayName: "チーム01",
      participantType: "team",
      memberNames: ["田中一郎", "佐藤花子"],
    };

    const result = buildLeagueMatrixPrintPages(league, "g1");

    expect(result.pages[0].rows[0].participant.fullLabel).toBe("チーム01\n田中一郎 / 佐藤花子");
    expect(result.pages[0].columns[0].displayName).toBe("チーム01");
  });

  it("空グループ、17名以上、存在しないグループは印刷対象外として返す", () => {
    expect(buildLeagueMatrixPrintPages(makeLeague(0), "g1").error).toBe("empty-group");
    expect(buildLeagueMatrixPrintPages(makeLeague(17), "g1").error).toBe("too-many-participants");
    expect(buildLeagueMatrixPrintPages(makeLeague(1), "unknown").error).toBe("group-not-found");
  });
});

function makeLeague(participantCount: number, groupParticipantIds?: string[]): League {
  const base = createDefaultLeague();
  const participants: LeagueParticipant[] = Array.from({ length: participantCount }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: `参加者${index + 1}`,
    participantType: "individual",
    memberNames: [`参加者${index + 1}`],
    selectionStatus: "selected",
  }));

  return {
    ...base,
    id: "league-print",
    participants,
    selection: {
      mode: "all",
      selectedParticipantIds: participants.map((participant) => participant.id),
      reserveParticipantIds: [],
    },
    groups: [{ id: "g1", name: "A", participantIds: groupParticipantIds ?? participants.map((participant) => participant.id) }],
  };
}
