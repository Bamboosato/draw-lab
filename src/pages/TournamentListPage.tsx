import { useMemo, useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import {
  getTournamentEditSteps,
  getTournamentStepPath,
  type TournamentEditStep,
} from "../app/tournamentFlow";
import {
  DEFAULT_TOURNAMENT_SORT,
  getNextTournamentSort,
  sortTournaments,
  type TournamentSort,
} from "../app/tournamentListSort";
import { downloadAllTournaments, downloadTournament } from "../app/tournamentPersistence";
import { isTournamentDrawCurrent } from "../app/tournamentModel";
import { useTournaments } from "../app/TournamentProvider";
import { CompactSummary } from "../components/CompactSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OverflowMenu, type OverflowMenuItem } from "../components/OverflowMenu";
import { SortableHeader } from "../components/SortableHeader";
import type { Tournament } from "../domain/types";

export function TournamentListPage() {
  const navigate = useViewTransitionNavigate();
  const {
    createTournament,
    deleteTournament,
    duplicateTournament,
    storageError,
    storageStatus,
    tournaments,
  } = useTournaments();
  const [deleteTargetId, setDeleteTargetId] = useState<string | undefined>();
  const [sort, setSort] = useState<TournamentSort>(DEFAULT_TOURNAMENT_SORT);
  const deleteTarget = tournaments.find((tournament) => tournament.id === deleteTargetId);
  const sortedTournaments = useMemo(() => sortTournaments(tournaments, sort), [sort, tournaments]);
  const storageReady = storageStatus === "ready";

  return (
    <div className="page-stack tournament-list-page">
      <section className="page-heading">
        <p className="page-description">作成済みのトーナメントを管理・編集します。</p>
        <div className="button-row no-print">
          <button
            type="button"
            className="button primary"
            title="新しいトーナメントを作成"
            disabled={!storageReady}
            onClick={() => {
              const tournament = createTournament();
              navigate(`/tournaments/${tournament.id}/edit/basic`);
            }}
          >
            新規作成
          </button>
          <OverflowMenu
            triggerLabel="トーナメント一覧のその他の操作"
            disabled={!storageReady}
            menuWidth={264}
            sections={[
              {
                label: "バックアップ",
                items: [
                  {
                    label: "全大会バックアップ",
                    title: "全大会をファイルへバックアップ",
                    icon: "backup",
                    disabled: tournaments.length === 0,
                    onSelect: () => downloadAllTournaments(tournaments),
                  },
                ],
              },
              {
                label: "復元",
                items: [
                  {
                    label: "大会情報の復元",
                    title: "大会情報をファイルから復元",
                    icon: "restore",
                    onSelect: () => navigate("/import"),
                  },
                ],
              },
            ]}
          />
        </div>
      </section>

      <CompactSummary
        ariaLabel="トーナメント概要"
        items={[
          { label: "全トーナメント", value: String(tournaments.length) },
          { label: "生成済み", value: String(tournaments.filter(isTournamentDrawCurrent).length) },
          { label: "編集中", value: String(tournaments.filter((item) => !isTournamentDrawCurrent(item)).length) },
        ]}
      />

      {storageStatus === "saving" ? (
        <p className="storage-status" role="status">IndexedDBへ自動保存しています。</p>
      ) : null}

      {storageStatus === "error" ? (
        <section className="import-result error" role="alert">
          <h3>ローカル保存を利用できません</h3>
          <p>{storageError || "IndexedDBの読み書きに失敗しました。ページを再読み込みしてください。"}</p>
        </section>
      ) : null}

      {storageStatus === "loading" ? (
        <section className="empty-state" aria-busy="true">
          <h3>保存済みデータを読み込んでいます。</h3>
          <p>IndexedDBと旧localStorageデータを確認しています。</p>
        </section>
      ) : tournaments.length === 0 ? (
        <section className="empty-state">
          <h3>保存済みのトーナメントはありません。</h3>
          <p>新規作成または大会情報の復元から開始してください。</p>
        </section>
      ) : (
        <section className="table-panel">
          <table className="data-table tournament-list-table">
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
                  getNextSort={getNextTournamentSort}
                />
                <th scope="col">サイズ</th>
                <th scope="col">状態</th>
                <SortableHeader
                  label="最終更新"
                  sortKey="updatedAt"
                  sort={sort}
                  ascendingLabel="古い順"
                  descendingLabel="新しい順"
                  onSort={setSort}
                  getNextSort={getNextTournamentSort}
                />
                <th scope="col">アクション</th>
              </tr>
            </thead>
            <tbody>
              {sortedTournaments.map((tournament) => {
                const drawCurrent = isTournamentDrawCurrent(tournament);
                const matchTypeLabel = tournament.matchType === "doubles"
                  ? "ダブルス"
                  : tournament.matchType === "team" ? "チーム" : "シングルス";

                return <tr key={tournament.id}>
                  <td>
                    <strong title={tournament.title || "無題のトーナメント"}>{tournament.title || "無題のトーナメント"}</strong>
                    <span className="muted-line">{tournament.venue || "会場未設定"}</span>
                  </td>
                  <td
                    className="tournament-event-cell"
                    title={`${tournament.eventName || "-"}（${matchTypeLabel}）`}
                  >
                    {tournament.eventName || "-"}
                    <span className="muted-line">（{matchTypeLabel}）</span>
                  </td>
                  <td>{tournament.date || "-"}</td>
                  <td>{tournament.drawSize}</td>
                  <td><StatusBadge tournament={tournament} /></td>
                  <td>{formatDateTime(tournament.updatedAt)}</td>
                  <td>
                    <div className="inline-actions">
                      <TournamentEditAction
                        tournament={tournament}
                        onSelect={(step) => navigate(getTournamentStepPath(tournament.id, step))}
                      />
                      <button
                        type="button"
                        title={drawCurrent
                          ? "生成済みトーナメント表を表示"
                          : "トーナメント表が未生成のためプレビューできません"}
                        disabled={!drawCurrent}
                        onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}
                      >
                        プレビュー
                      </button>
                      <ActionMenu
                        tournament={tournament}
                        onDuplicate={() => {
                          void duplicateTournament(tournament.id).then((duplicated) => {
                            if (duplicated) {
                              navigate(`/tournaments/${duplicated.id}/edit/basic`);
                            }
                          });
                        }}
                        onExport={() => downloadTournament(tournament)}
                        onDelete={() => setDeleteTargetId(tournament.id)}
                      />
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="トーナメントを削除します"
        message={`${deleteTarget?.title || "無題のトーナメント"} を削除しますか？`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        tone="danger"
        onCancel={() => setDeleteTargetId(undefined)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteTournament(deleteTarget.id);
          }
          setDeleteTargetId(undefined);
        }}
      />
    </div>
  );
}

function ActionMenu({
  tournament,
  onDuplicate,
  onExport,
  onDelete,
}: {
  tournament: Tournament;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <OverflowMenu
      triggerLabel={`${tournament.title || "大会"}のその他の操作`}
      menuWidth={160}
      sections={[
        {
          label: "大会情報",
          items: [
            {
              label: "複製",
              title: "大会情報(個別)を複製",
              icon: "duplicate",
              onSelect: onDuplicate,
            },
            {
              label: "出力",
              title: "大会情報(個別)をファイルへ出力",
              icon: "export",
              onSelect: onExport,
            },
            {
              label: "削除",
              title: "大会情報(個別)を削除",
              icon: "delete",
              danger: true,
              dividerBefore: true,
              onSelect: onDelete,
            },
          ],
        },
      ]}
    />
  );
}

function TournamentEditAction({
  tournament,
  onSelect,
}: {
  tournament: Tournament;
  onSelect: (step: TournamentEditStep) => void;
}) {
  const editSteps = getTournamentEditSteps(tournament);

  if (editSteps.length === 1) {
    return (
      <button type="button" title="基本情報を編集" onClick={() => onSelect("basic")}>
        編集
      </button>
    );
  }

  return (
    <OverflowMenu
      triggerLabel={`${tournament.title || "大会"}の編集画面を選択`}
      triggerTitle="編集画面を選択"
      triggerText="編集"
      menuWidth={176}
      sections={[
        {
          label: "編集画面",
          items: editSteps.map((step) => ({
            ...getEditStepMenuPresentation(step),
            onSelect: () => onSelect(step),
          })),
        },
      ]}
    />
  );
}

function getEditStepMenuPresentation(step: TournamentEditStep): Pick<OverflowMenuItem, "label" | "title" | "icon"> {
  switch (step) {
    case "basic":
      return { label: "基本情報", title: "基本情報を編集", icon: "basic" };
    case "entrants":
      return { label: "名簿入力", title: "名簿入力を編集", icon: "entrants" };
    case "options":
      return { label: "オプション設定", title: "オプション設定を編集", icon: "options" };
  }
}

function StatusBadge({ tournament }: { tournament: Tournament }) {
  const drawCurrent = isTournamentDrawCurrent(tournament);
  const label = drawCurrent ? "生成済" : "未生成";

  return <span className={`status-badge ${drawCurrent ? "generated" : "draft"}`}>{label}</span>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
