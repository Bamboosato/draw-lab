import { useMemo, useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { getLeagueEditSteps, getLeagueStatus, getLeagueStepPath, type LeagueEditStep } from "../app/leagueFlow";
import {
  DEFAULT_LEAGUE_SORT,
  getNextLeagueSort,
  sortLeagues,
  type LeagueSort,
} from "../app/leagueListSort";
import { useLeagues } from "../app/LeagueProvider";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CompactSummary } from "../components/CompactSummary";
import { LeaguePageHeading, LeagueStorageMessage, participantTypeLabel } from "../components/LeaguePageParts";
import { LeagueScoringDialog } from "../components/LeagueScoringDialog";
import { OverflowMenu, type OverflowMenuItem } from "../components/OverflowMenu";
import { SortableHeader } from "../components/SortableHeader";
import { downloadAllLeagues, downloadLeague } from "../storage/leagueJson";
import { updateScoringPolicy } from "../app/leagueModel";
import { DEFAULT_LEAGUE_SCORING_POLICY } from "../domain/leagueLogic";
import type { League } from "../domain/leagueTypes";

export function LeagueListPage() {
  const navigate = useViewTransitionNavigate();
  const {
    leagues,
    createLeague,
    deleteLeague,
    duplicateLeague,
    updateLeague,
    storageError,
    storageStatus,
  } = useLeagues();
  const [deleteTargetId, setDeleteTargetId] = useState<string>();
  const [scoringTargetId, setScoringTargetId] = useState<string>();
  const [sort, setSort] = useState<LeagueSort>(DEFAULT_LEAGUE_SORT);
  const deleteTarget = leagues.find((league) => league.id === deleteTargetId);
  const scoringTarget = leagues.find((league) => league.id === scoringTargetId);
  const sortedLeagues = useMemo(() => sortLeagues(leagues, sort), [leagues, sort]);
  const storageReady = storageStatus === "ready";
  const completedCount = leagues.filter((league) => league.status === "completed").length;
  const operatingCount = leagues.filter((league) => league.status !== "completed" && league.matchSelectionStatus === "confirmed").length;
  const editingCount = leagues.length - completedCount - operatingCount;

  const create = (): void => {
    const league = createLeague();
    navigate(`/leagues/${league.id}/edit/basic`);
  };

  return (
    <div className="page-stack league-page league-list-page">
      <LeaguePageHeading
        description="作成済みのリーグを管理・編集します。"
        actions={(
          <>
            <button type="button" className="button primary" title="新しいリーグを作成" disabled={!storageReady} onClick={create}>
              新規作成
            </button>
            <OverflowMenu
              triggerLabel="リーグ一覧のその他の操作"
              disabled={!storageReady}
              menuWidth={264}
              sections={[
                {
                  label: "バックアップ",
                  items: [
                    {
                      label: "全リーグバックアップ",
                      title: "全リーグをファイルへバックアップ",
                      icon: "backup",
                      disabled: leagues.length === 0,
                      onSelect: () => downloadAllLeagues(leagues),
                    },
                  ],
                },
                {
                  label: "復元",
                  items: [
                    {
                      label: "リーグ情報の復元",
                      title: "リーグ情報をファイルから復元",
                      icon: "restore",
                      onSelect: () => navigate("/leagues/import"),
                    },
                  ],
                },
              ]}
            />
          </>
        )}
      />
      <LeagueStorageMessage status={storageStatus} error={storageError} />

      <CompactSummary
        ariaLabel="リーグ概要"
        items={[
          { label: "全リーグ", value: String(leagues.length) },
          { label: "編集中", value: String(editingCount) },
          { label: "運用中", value: String(operatingCount) },
          { label: "完了", value: String(completedCount) },
        ]}
      />

      {storageStatus === "loading" ? (
        <section className="empty-state" aria-busy="true">
          <h3>保存済みデータを読み込んでいます。</h3>
          <p>IndexedDBのリーグデータを確認しています。</p>
        </section>
      ) : leagues.length === 0 ? (
        <section className="empty-state">
          <h3>保存済みのリーグはありません。</h3>
          <p>新規作成またはリーグ情報の復元から開始してください。</p>
        </section>
      ) : (
        <section className="table-panel">
          <table className="data-table league-list-table">
            <thead>
              <tr>
                <th scope="col">大会名</th>
                <th scope="col">種目</th>
                <SortableHeader
                  label="開催日"
                  sortKey="date"
                  sort={sort}
                  ascendingLabel="近い順"
                  descendingLabel="遠い順"
                  onSort={setSort}
                  getNextSort={getNextLeagueSort}
                />
                <th scope="col">定員</th>
                <th scope="col">状態</th>
                <SortableHeader
                  label="最終更新"
                  sortKey="updatedAt"
                  sort={sort}
                  ascendingLabel="古い順"
                  descendingLabel="新しい順"
                  onSort={setSort}
                  getNextSort={getNextLeagueSort}
                />
                <th scope="col">アクション</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeagues.map((league) => {
                const dashboardReady = league.matchSelectionStatus === "confirmed";
                const status = getLeagueStatus(league);

                return (
                  <tr key={league.id}>
                    <td>
                      <strong title={league.title || "無題のリーグ"}>{league.title || "無題のリーグ"}</strong>
                      <span className="muted-line">{league.venue || "会場未設定"}</span>
                    </td>
                    <td className="league-event-cell" title={`${league.eventName || "-"}（${participantTypeLabel(league.participantType)}）`}>
                      {league.eventName || "-"}
                      <span className="muted-line">（{participantTypeLabel(league.participantType)}）</span>
                    </td>
                    <td>{league.date || "-"}</td>
                    <td>{league.capacity}</td>
                    <td><span className={`status-badge ${status.className}`}>{status.label}</span></td>
                    <td>{formatDateTime(league.updatedAt)}</td>
                    <td>
                      <div className="inline-actions">
                        <LeagueEditAction league={league} onSelect={(step) => navigate(getLeagueStepPath(league.id, step))} />
                        <button
                          type="button"
                          title={dashboardReady ? "リーグ表を表示" : "対戦カードが未確定のためリーグ表を表示できません"}
                          disabled={!dashboardReady}
                          onClick={() => navigate(`/leagues/${league.id}/dashboard`)}
                        >
                          リーグ表
                        </button>
                        <LeagueActionMenu
                          league={league}
                          onDuplicate={() => {
                            void duplicateLeague(league.id).then((duplicated) => {
                              if (duplicated) {
                                navigate(`/leagues/${duplicated.id}/edit/basic`);
                              }
                            });
                          }}
                          onExport={() => downloadLeague(league)}
                          onDelete={() => setDeleteTargetId(league.id)}
                          onScoring={() => setScoringTargetId(league.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="リーグを削除します"
        message={`${deleteTarget?.title || "無題のリーグ"} を削除しますか？`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        tone="danger"
        onCancel={() => setDeleteTargetId(undefined)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteLeague(deleteTarget.id);
          }
          setDeleteTargetId(undefined);
        }}
      />
      <LeagueScoringDialog
        open={Boolean(scoringTarget)}
        scoringPolicy={scoringTarget?.scoringPolicy ?? DEFAULT_LEAGUE_SCORING_POLICY}
        readOnly={scoringTarget?.status === "completed"}
        onCancel={() => setScoringTargetId(undefined)}
        onSave={(scoringPolicy) => {
          if (scoringTarget) updateLeague(updateScoringPolicy(scoringTarget, scoringPolicy));
          setScoringTargetId(undefined);
        }}
      />
    </div>
  );
}

function LeagueActionMenu({
  league,
  onDuplicate,
  onExport,
  onDelete,
  onScoring,
}: {
  league: League;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onScoring: () => void;
}) {
  return (
    <OverflowMenu
      triggerLabel={`${league.title || "リーグ"}のその他の操作`}
      menuWidth={160}
      sections={[{
        label: "リーグ設定",
        items: [
          { label: "勝点設定", title: "勝点設定を編集", icon: "options", onSelect: onScoring },
        ],
      }, {
        label: "リーグ情報",
        items: [
          { label: "複製", title: "リーグ情報(個別)を複製", icon: "duplicate", onSelect: onDuplicate },
          { label: "出力", title: "リーグ情報(個別)をファイルへ出力", icon: "export", onSelect: onExport },
          { label: "削除", title: "リーグ情報(個別)を削除", icon: "delete", danger: true, dividerBefore: true, onSelect: onDelete },
        ],
      }]}
    />
  );
}

function LeagueEditAction({ league, onSelect }: { league: League; onSelect: (step: LeagueEditStep | "dashboard") => void }) {
  if (league.status === "completed") {
    return <button type="button" title="完了済みリーグを表示し、必要に応じて編集を再開" onClick={() => onSelect("dashboard")}>編集</button>;
  }

  const editSteps = getLeagueEditSteps(league);
  if (editSteps.length === 1) {
    const presentation = getLeagueEditStepMenuPresentation(editSteps[0]);
    return <button type="button" title={presentation.title} onClick={() => onSelect(editSteps[0])}>編集</button>;
  }

  return (
    <OverflowMenu
      triggerLabel={`${league.title || "リーグ"}の編集画面を選択`}
      triggerTitle="編集画面を選択"
      triggerText="編集"
      menuWidth={200}
      sections={[{
        label: "編集画面",
        items: editSteps.map((step) => ({
          ...getLeagueEditStepMenuPresentation(step),
          onSelect: () => onSelect(step),
        })),
      }]}
    />
  );
}

function getLeagueEditStepMenuPresentation(step: LeagueEditStep): Pick<OverflowMenuItem, "label" | "title" | "icon"> {
  switch (step) {
    case "basic":
      return { label: "基本情報", title: "基本情報を編集", icon: "basic" };
    case "participants":
      return { label: "名簿入力・選出", title: "名簿入力・選出を編集", icon: "entrants" };
    case "groups":
      return { label: "グループ設定", title: "グループ設定を編集", icon: "options" };
    case "matches":
      return { label: "対戦カード", title: "対戦カードを編集", icon: "options" };
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}
