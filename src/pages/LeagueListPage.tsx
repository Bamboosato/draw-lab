import { useMemo, useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
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
import { OverflowMenu } from "../components/OverflowMenu";
import { SortableHeader } from "../components/SortableHeader";
import { downloadAllLeagues, downloadLeague } from "../storage/leagueJson";
import type { League } from "../domain/leagueTypes";

export function LeagueListPage() {
  const navigate = useViewTransitionNavigate();
  const {
    leagues,
    createLeague,
    deleteLeague,
    duplicateLeague,
    storageError,
    storageStatus,
  } = useLeagues();
  const [deleteTargetId, setDeleteTargetId] = useState<string>();
  const [sort, setSort] = useState<LeagueSort>(DEFAULT_LEAGUE_SORT);
  const deleteTarget = leagues.find((league) => league.id === deleteTargetId);
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
                        <button type="button" title="基本情報を編集" onClick={() => navigate(`/leagues/${league.id}/edit/basic`)}>
                          編集
                        </button>
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
    </div>
  );
}

function LeagueActionMenu({
  league,
  onDuplicate,
  onExport,
  onDelete,
}: {
  league: League;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <OverflowMenu
      triggerLabel={`${league.title || "リーグ"}のその他の操作`}
      menuWidth={160}
      sections={[{
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

function getLeagueStatus(league: League): { label: string; className: "generated" | "draft" } {
  if (league.status === "completed") {
    return { label: "完了", className: "generated" };
  }
  if (league.matchSelectionStatus === "confirmed") {
    return { label: "運用中", className: "generated" };
  }
  return { label: "編集中", className: "draft" };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}
