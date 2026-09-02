import { useMemo, useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import {
  getTournamentEditSteps,
  getTournamentStepPath,
  type TournamentEditStep,
} from "../app/tournamentFlow";
import { getLeagueStepPath } from "../app/leagueFlow";
import {
  DEFAULT_TOURNAMENT_SORT,
  getNextTournamentSort,
  sortTournaments,
  type TournamentSort,
} from "../app/tournamentListSort";
import { downloadAllTournaments, downloadTournament } from "../app/tournamentPersistence";
import { createLeagueToTournament } from "../app/leagueTournamentAdapter";
import { isTournamentDrawCurrent } from "../app/tournamentModel";
import { useTournaments } from "../app/TournamentProvider";
import { useLeagues } from "../app/LeagueProvider";
import { CompactSummary } from "../components/CompactSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LeagueTournamentCreateDialog } from "../components/LeagueTournamentCreateDialog";
import { OverflowMenu, type OverflowMenuItem } from "../components/OverflowMenu";
import { SortableHeader } from "../components/SortableHeader";
import type { Tournament } from "../domain/types";
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";

export function TournamentListPage() {
  const navigate = useViewTransitionNavigate();
  const {
    createTournament,
    deleteTournament,
    duplicateTournament,
    updateTournamentWithIntegration,
    storageError,
    storageStatus,
    tournaments,
    getTournamentIntegration,
  } = useTournaments();
  const { leagues } = useLeagues();
  const [deleteTargetId, setDeleteTargetId] = useState<string | undefined>();
  const [leagueCreateDialogOpen, setLeagueCreateDialogOpen] = useState(false);
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
                label: "作成",
                items: [
                  {
                    label: "リーグ表から作成",
                    title: "予選のリーグ表からトーナメントを作成",
                    icon: "basic",
                    onSelect: () => setLeagueCreateDialogOpen(true),
                  },
                ],
              },
              {
                label: "バックアップ",
                items: [
                  {
                    label: "全大会バックアップ",
                    title: "全大会をファイルへバックアップ",
                    icon: "backup",
                    disabled: tournaments.length === 0,
                    onSelect: () => downloadAllTournaments(tournaments, integrationsForExport(tournaments, getTournamentIntegration)),
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
          { label: "生成済み", value: String(tournaments.filter((item) => isTournamentDrawCurrent(item, getTournamentIntegration(item.id))).length) },
          { label: "編集中", value: String(tournaments.filter((item) => !isTournamentDrawCurrent(item, getTournamentIntegration(item.id))).length) },
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
                <th scope="col">予選</th>
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
                const integration = getTournamentIntegration(tournament.id);
                const sourceLeague = integration ? leagues.find((league) => league.id === integration.source.leagueId) : undefined;
                const drawCurrent = isTournamentDrawCurrent(tournament, integration);
                const matchTypeLabel = tournament.matchType === "doubles"
                  ? "ダブルス"
                  : tournament.matchType === "team" ? "チーム" : "シングルス";

                return <tr key={tournament.id}>
                  <td>
                    <strong title={tournament.title || "無題のトーナメント"}>{tournament.title || "無題のトーナメント"}</strong>
                    <span className="muted-line">{tournament.venue || "会場未設定"}</span>
                  </td>
                  <td className="tournament-qualifier-cell">
                    {sourceLeague ? (
                      <a
                        className="tournament-source-link"
                        href={getLeagueStepPath(sourceLeague.id, "dashboard")}
                        aria-label="引継ぎ元のリーグ表を表示"
                        title={`引継ぎ元のリーグ表「${sourceLeague.title || "無題のリーグ"}」を表示`}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d="M8 12l4-4" />
                          <path d="M6.5 15.5H5a3 3 0 0 1 0-6h2" />
                          <path d="M13.5 4.5H15a3 3 0 0 1 0 6h-2" />
                        </svg>
                      </a>
                    ) : null}
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
                  <td><StatusBadge tournament={tournament} integration={integration} /></td>
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
                        onExport={() => downloadTournament(tournament, integration)}
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
      <LeagueTournamentCreateDialog
        open={leagueCreateDialogOpen}
        leagues={leagues}
        onCancel={() => setLeagueCreateDialogOpen(false)}
        onConfirm={(league, rankRange) => {
          const draft = createTournament();
          const result = createLeagueToTournament(draft, league, rankRange);
          updateTournamentWithIntegration(result.tournament, result.integration);
          setLeagueCreateDialogOpen(false);
          navigate(`/tournaments/${draft.id}/edit/basic`);
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

function StatusBadge({ tournament, integration }: { tournament: Tournament; integration?: TournamentIntegrationRecord }) {
  const drawCurrent = isTournamentDrawCurrent(tournament, integration);
  const label = drawCurrent ? "生成済" : "未生成";

  return <span className={`status-badge ${drawCurrent ? "generated" : "draft"}`}>{label}</span>;
}

function integrationsForExport(
  tournaments: readonly Tournament[],
  getIntegration: (tournamentId: string) => TournamentIntegrationRecord | undefined,
): TournamentIntegrationRecord[] {
  return tournaments
    .map((tournament) => getIntegration(tournament.id))
    .filter((integration): integration is TournamentIntegrationRecord => Boolean(integration));
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
