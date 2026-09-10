import { describe, expect, it } from "vitest";
import { createDefaultLeague } from "../app/leagueModel";
import {
  buildHomeViewModel,
  getLeagueResumePath,
  getTournamentResumePath,
} from "../app/homeViewModel";
import { makeTournament } from "./testFactory";

describe("homeViewModel", () => {
  describe("集計", () => {
    it("トーナメントとリーグを編集中・運用中・完了へ分類する", () => {
      const generatedTournament = makeTournament({
        id: "tournament-generated",
        generatedDraw: {
          id: "draw-1",
          tournamentId: "tournament-generated",
          randomSeed: "seed-1",
          generatedAt: "2026-07-03T00:00:00.000Z",
          slots: [],
          matches: [],
        },
        matchSelectionStatus: "confirmed" as const,
      });
      const completedTournament = makeTournament({ id: "tournament-completed", status: "completed" });
      const editingLeague = { ...createDefaultLeague(), id: "league-editing" };
      const operatingLeague = {
        ...createDefaultLeague(),
        id: "league-operating",
        status: "scheduled" as const,
        matchSelectionStatus: "confirmed" as const,
      };
      const completedLeague = {
        ...createDefaultLeague(),
        id: "league-completed",
        status: "completed" as const,
      };

      const viewModel = buildHomeViewModel(
        [generatedTournament, makeTournament({ id: "tournament-editing" }), completedTournament],
        [editingLeague, operatingLeague, completedLeague],
      );

      expect(viewModel.tournament).toEqual({ total: 3, operating: 1, editing: 1, completed: 1 });
      expect(viewModel.league).toEqual({ total: 3, editing: 1, operating: 1, completed: 1 });
    });

    it("最近更新項目でもトーナメントの状態を編集中・運用中・完了で表示する", () => {
      const operating = makeTournament({
        id: "tournament-operating",
        generatedDraw: {
          id: "draw-operating",
          tournamentId: "tournament-operating",
          randomSeed: "seed-operating",
          generatedAt: "2026-07-03T00:00:00.000Z",
          slots: [],
          matches: [],
        },
        matchSelectionStatus: "confirmed" as const,
      });
      const editing = makeTournament({ id: "tournament-editing" });
      const completed = makeTournament({ id: "tournament-completed", status: "completed" });

      const viewModel = buildHomeViewModel([operating, editing, completed], []);

      expect(Object.fromEntries(viewModel.recentItems.map((item) => [item.id, item.status]))).toEqual({
        "tournament-operating": "運用中",
        "tournament-editing": "編集中",
        "tournament-completed": "完了",
      });
    });
  });

  describe("最近更新項目", () => {
    it("トーナメントとリーグを統合し、更新日時の新しい順で最大5件に絞る", () => {
      const tournaments = [1, 2, 3].map((index) => makeTournament({
        id: `tournament-${index}`,
        title: `トーナメント${index}`,
        updatedAt: `2026-07-0${index}T00:00:00.000Z`,
      }));
      const leagues = [4, 5, 6].map((index) => ({
        ...createDefaultLeague(),
        id: `league-${index}`,
        title: `リーグ${index}`,
        updatedAt: `2026-07-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      }));

      const viewModel = buildHomeViewModel(tournaments, leagues);

      expect(viewModel.recentItems).toHaveLength(5);
      expect(viewModel.recentItems.map((item) => item.id)).toEqual([
        "league-6",
        "league-5",
        "league-4",
        "tournament-3",
        "tournament-2",
      ]);
    });

    it("不正日時を末尾に置き、同日時と不正日時の順序は入力順を維持する", () => {
      const tournaments = [
        makeTournament({ id: "invalid-first", updatedAt: "invalid" }),
        makeTournament({ id: "same-first", updatedAt: "2026-07-02T00:00:00.000Z" }),
        makeTournament({ id: "same-second", updatedAt: "2026-07-02T00:00:00.000Z" }),
        makeTournament({ id: "invalid-second", updatedAt: "" }),
      ];

      const viewModel = buildHomeViewModel(tournaments, []);

      expect(viewModel.recentItems.map((item) => item.id)).toEqual([
        "same-first",
        "same-second",
        "invalid-first",
        "invalid-second",
      ]);
    });

    it("大会名と開催日の未設定値を種別ごとの既定文言へ置き換える", () => {
      const tournament = makeTournament({ id: "tournament-fallback", title: "", date: "" });
      const league = {
        ...createDefaultLeague(),
        id: "league-fallback",
        title: "",
        date: "",
        updatedAt: "2026-07-02T00:00:00.000Z",
      };

      const viewModel = buildHomeViewModel([tournament], [league]);

      expect(viewModel.recentItems.map(({ title, date }) => ({ title, date }))).toEqual([
        { title: "無題のトーナメント", date: "未設定" },
        { title: "無題のリーグ", date: "未設定" },
      ]);
    });
  });

  describe("再開先", () => {
    it("トーナメントの未完了ステップとドロー有効性に応じて遷移先を返す", () => {
      expect(getTournamentResumePath(makeTournament({ id: "basic-error", seedCount: 17, drawSize: 16 })))
        .toBe("/tournaments/basic-error/edit/basic");
      expect(getTournamentResumePath(makeTournament({ id: "roster-error", entrants: [] })))
        .toBe("/tournaments/roster-error/edit/entrants");
      expect(getTournamentResumePath(makeTournament({ id: "options", generatedDraw: undefined })))
        .toBe("/tournaments/options/edit/options");
      expect(getTournamentResumePath(makeTournament({ id: "completed", status: "completed" })))
        .toBe("/tournaments/completed/preview");
      expect(getTournamentResumePath(makeTournament({
        id: "preview",
        generatedDraw: {
          id: "draw-preview",
          tournamentId: "preview",
          randomSeed: "seed-preview",
          generatedAt: "2026-07-03T00:00:00.000Z",
          slots: [],
          matches: [],
        },
      }))).toBe("/tournaments/preview/preview");
    });

    it("リーグは入力途中なら最初の未完了ステップ、確定済みまたは完了済みならリーグ表へ遷移する", () => {
      const draft = { ...createDefaultLeague(), id: "league-draft" };
      const operating = { ...draft, id: "league-operating", matchSelectionStatus: "confirmed" as const };
      const completed = { ...draft, id: "league-completed", status: "completed" as const };

      expect(getLeagueResumePath(draft)).toBe("/leagues/league-draft/edit/participants");
      expect(getLeagueResumePath(operating)).toBe("/leagues/league-operating/dashboard");
      expect(getLeagueResumePath(completed)).toBe("/leagues/league-completed/dashboard");
    });
  });
});
