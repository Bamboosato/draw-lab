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

  it("完了後は勝敗記号を表示し、詳細表示ONならセット詳細を行単位で返す", () => {
    const league = makeLeague(2);
    league.status = "completed";
    league.detailInputEnabled = true;
    league.detailDisplayEnabled = true;
    league.matches = [{
      id: "m1",
      groupId: "g1",
      order: 1,
      participantAId: "p1",
      participantBId: "p2",
      isValid: true,
      result: "participantAWin",
      setScores: [
        { participantA: 6, participantB: 1 },
        { participantA: null, participantB: null },
        { participantA: 6, participantB: 3 },
      ],
    }];
    league.matchFormat = 3;

    const result = buildLeagueMatrixPrintPages(league, "g1");
    const firstRow = result.pages[0]?.rows[0];
    const cell = firstRow?.cells.find((item) => item.participantId === "p2");

    expect(cell).toMatchObject({ result: "○", details: ["6-1", "-", "6-3"] });
  });

  it("現在の入力内容モードでは左側参加者に有効順位を持たせ、空欄モードでは順位を持たせない", () => {
    const league = makeLeague(3);
    league.status = "completed";
    league.standings = league.participants.map((participant, index) => ({
      groupId: "g1",
      participantId: participant.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      manualRank: index === 0 ? 2 : index === 1 ? 1 : undefined,
      rankStatus: index < 2 ? "confirmed" : "unconfirmed",
    }));

    const current = buildLeagueMatrixPrintPages(league, "g1", "current");
    expect(current.pages[0]?.rows.map((row) => row.participant.rank)).toEqual([2, 1, 3]);

    const blank = buildLeagueMatrixPrintPages(league, "g1", "blank");
    expect(blank.pages[0]?.rows.every((row) => row.participant.rank === undefined)).toBe(true);
  });

  it("WOの詳細表示はゲーム数の代わりにWOを返す", () => {
    const league = makeLeague(2);
    league.status = "completed";
    league.detailInputEnabled = true;
    league.detailDisplayEnabled = true;
    league.matchFormat = 3;
    league.matches = [{
      id: "m1",
      groupId: "g1",
      order: 1,
      participantAId: "p1",
      participantBId: "p2",
      isValid: true,
      result: "participantAWin",
      isWalkover: true,
      setScores: [
        { participantA: 6, participantB: 3 },
        { participantA: null, participantB: null },
        { participantA: null, participantB: null },
      ],
    }];

    const result = buildLeagueMatrixPrintPages(league, "g1");
    const cell = result.pages[0]?.rows[0]?.cells.find((item) => item.participantId === "p2");

    expect(cell).toMatchObject({ result: "○", details: ["WO"] });
  });

  it("未完了では勝敗記号とセット詳細を空欄にする", () => {
    const league = makeLeague(2);
    league.detailInputEnabled = true;
    league.detailDisplayEnabled = true;
    league.matches = [{
      id: "m1",
      groupId: "g1",
      order: 1,
      participantAId: "p1",
      participantBId: "p2",
      isValid: true,
      result: "participantAWin",
      setScores: [{ participantA: 6, participantB: 1 }],
    }];

    const result = buildLeagueMatrixPrintPages(league, "g1");
    const cell = result.pages[0]?.rows[0]?.cells.find((item) => item.participantId === "p2");

    expect(cell).not.toHaveProperty("result");
    expect(cell).not.toHaveProperty("details");
  });

  it("未完了でも現在の入力内容モードなら勝敗記号とセット詳細を表示する", () => {
    const league = makeLeague(2);
    league.detailInputEnabled = true;
    league.detailDisplayEnabled = true;
    league.matches = [{
      id: "m1",
      groupId: "g1",
      order: 1,
      participantAId: "p1",
      participantBId: "p2",
      isValid: true,
      result: "participantAWin",
      setScores: [{ participantA: 6, participantB: 1 }],
    }];

    const result = buildLeagueMatrixPrintPages(league, "g1", "current");
    const cell = result.pages[0]?.rows[0]?.cells.find((item) => item.participantId === "p2");

    expect(cell).toMatchObject({ result: "○", details: ["6-1"] });
  });

  it("完了後でも結果を空欄で表示モードなら結果を含めない", () => {
    const league = makeLeague(2);
    league.status = "completed";
    league.matches = [{
      id: "m1",
      groupId: "g1",
      order: 1,
      participantAId: "p1",
      participantBId: "p2",
      isValid: true,
      result: "participantAWin",
      setScores: [{ participantA: 6, participantB: 1 }],
    }];

    const result = buildLeagueMatrixPrintPages(league, "g1", "blank");
    const cell = result.pages[0]?.rows[0]?.cells.find((item) => item.participantId === "p2");

    expect(cell).not.toHaveProperty("result");
    expect(cell).not.toHaveProperty("details");
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
