import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import { getLeagueEditSteps } from "../app/leagueFlow";

describe("leagueFlow", () => {
  it("未入力のリーグでは基本情報だけを編集対象にする", () => {
    expect(getLeagueEditSteps(createDefaultLeague())).toEqual(["basic"]);
  });

  it("保存済みの参加者・グループ・対戦カードを状態に応じて編集対象にする", () => {
    const league = createDefaultLeague();
    const participant = {
      id: "participant-1",
      displayName: "選手1",
      participantType: "individual" as const,
      memberNames: ["選手1"],
      selectionStatus: "selected" as const,
    };

    expect(getLeagueEditSteps({
      ...league,
      participants: [participant],
      selection: { mode: "manual", selectedParticipantIds: [participant.id], reserveParticipantIds: [] },
      groups: [{ id: "group-1", name: "A", participantIds: [participant.id] }],
      matches: [{ id: "match-1", groupId: "group-1", order: 1, participantAId: participant.id, participantBId: "participant-2", isValid: true, result: "unplayed" }],
      matchSelectionStatus: "confirmed",
    })).toEqual(["basic", "participants", "groups", "matches"]);
  });

  it("完了済みリーグでは編集画面を提供せず、リーグ表から再開させる", () => {
    expect(getLeagueEditSteps({ ...createDefaultLeague(), status: "completed" })).toEqual([]);
  });
});
