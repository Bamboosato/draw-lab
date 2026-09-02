import { describe, expect, it } from "vitest";
import { createLeagueToTournament } from "../app/leagueTournamentAdapter";
import { getLeagueTournamentScope, getRankRangeValidationMessage } from "../app/leagueTournamentPlacement";
import { createDefaultLeague } from "../app/leagueModel";
import { applyBasicInfoPatch, createDefaultTournament, generateTournamentDraw, isTournamentDrawCurrent, validateTournamentForUi } from "../app/tournamentModel";
import type { League } from "../domain/leagueTypes";

function makeLinkedTeamTournament(): { tournament: ReturnType<typeof createDefaultTournament>; integration: ReturnType<typeof createLeagueToTournament>["integration"] } {
  const league: League = {
    ...createDefaultLeague(),
    id: "league-placement",
    participantType: "team",
    capacity: 4,
    participants: [1, 2, 3, 4].map((index) => ({
      id: `p${index}`,
      displayName: `Team ${index}`,
      participantType: "team",
      memberNames: [`Member ${index}`],
      team: `Affiliation ${index}`,
      selectionStatus: "selected",
    })),
    selection: { mode: "all", selectedParticipantIds: ["p1", "p2", "p3", "p4"], reserveParticipantIds: [] },
    standings: [1, 2, 3, 4].map((index) => ({
      groupId: index <= 2 ? "g1" : "g2",
      participantId: `p${index}`,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      manualRank: index,
      rankStatus: "confirmed" as const,
    })),
    groups: [
      { id: "g1", name: "A組", participantIds: ["p1", "p2"] },
      { id: "g2", name: "B組", participantIds: ["p3", "p4"] },
    ],
    matchSelectionStatus: "confirmed",
    status: "scheduled",
  };
  const result = createLeagueToTournament({ ...createDefaultTournament(), drawSize: 4 }, league, { min: 1, max: 2 });
  return { tournament: result.tournament, integration: result.integration };
}

describe("leagueTournamentPlacement", () => {
  it("意図: 開始順位が終了順位を超える場合に前後関係に合ったエラー文言を返す", () => {
    expect(getRankRangeValidationMessage({ min: 3, max: 2 }, 4))
      .toBe("終了順位は開始順位（3位）以上で指定してください");
  });

  it("意図: 順位区分内だけを生成対象にし、生成署名へ連携条件を反映する", () => {
    const linked = makeLinkedTeamTournament();
    const integration = { ...linked.integration, rankRange: { min: 1, max: 2 } };
    const result = generateTournamentDraw(linked.tournament, "linked-seed", integration);

    expect(result.validation.errors).toEqual([]);
    expect(result.draw?.slots.filter((slot) => slot.entrantId)).toHaveLength(2);
    const selectedEntrantIds = new Set(
      linked.integration.participants
        .filter((participant) => participant.rank === 1 || participant.rank === 2)
        .map((participant) => participant.tournamentEntrantId),
    );
    expect(new Set(result.draw?.slots.map((slot) => slot.entrantId).filter(Boolean))).toEqual(selectedEntrantIds);
    expect(result.draw?.generationInputSignature).toBeDefined();
    expect(isTournamentDrawCurrent(result.tournament, integration)).toBe(true);
  });

  it("意図: 順位未入力は警告として対象外にし、該当者不足は生成エラーにする", () => {
    const linked = makeLinkedTeamTournament();
    const integration = {
      ...linked.integration,
      participants: linked.integration.participants.map((participant) =>
        participant.sourceParticipantId === "p4" ? { ...participant, rank: undefined, rankOrigin: undefined } : participant),
      rankRange: { min: 1, max: 2 },
    };
    const validation = validateTournamentForUi(linked.tournament, integration);
    expect(validation.warnings.map((issue) => issue.code)).toContain("LEAGUE_RANK_MISSING");

    const tooNarrow = { ...integration, rankRange: { min: 2, max: 2 } };
    expect(validateTournamentForUi(linked.tournament, tooNarrow).errors.map((issue) => issue.code))
      .toContain("LEAGUE_RANKED_ENTRANTS_TOO_FEW");
  });

  it("意図: 終了順位がグループ人数の最小値を超える場合に生成エラーにする", () => {
    const linked = makeLinkedTeamTournament();
    const invalid = { ...linked.integration, rankRange: { min: 1, max: 3 } };

    expect(validateTournamentForUi(linked.tournament, invalid).errors.map((issue) => issue.code))
      .toContain("LEAGUE_RANK_RANGE_INVALID");
  });

  it("意図: グループ未設定・順位区分不正を境界値として検出する", () => {
    const linked = makeLinkedTeamTournament();
    const invalid = { ...linked.integration, rankRange: { min: 0, max: 0 } };
    const scope = getLeagueTournamentScope(linked.tournament, invalid);
    expect(scope.issues.errors.map((issue) => issue.code)).toContain("LEAGUE_RANK_RANGE_INVALID");
    expect(getLeagueTournamentScope(linked.tournament, linked.integration).placementContext.groupCount).toBe(2);
  });

  it("意図: 連携大会の表示情報だけを変更しても、生成済みドローを現行のまま保つ", () => {
    const linked = makeLinkedTeamTournament();
    const generated = generateTournamentDraw(linked.tournament, "stable-seed", linked.integration);
    expect(generated.draw).toBeDefined();
    const updated = applyBasicInfoPatch(generated.tournament, { title: "表示名変更" }, linked.integration);

    expect(updated.generatedDraw?.slots).toEqual(generated.draw?.slots);
    expect(isTournamentDrawCurrent(updated, linked.integration)).toBe(true);
  });
});
