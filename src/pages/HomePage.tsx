import { useMemo } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { buildHomeViewModel, type HomeViewModel } from "../app/homeViewModel";
import { type StorageStatus, useTournaments } from "../app/TournamentProvider";
import { type LeagueStorageStatus, useLeagues } from "../app/LeagueProvider";
import { PwaInstallGuide } from "../components/PwaInstallGuide";

type HomeStorageStatus = StorageStatus | LeagueStorageStatus;

export function HomePage() {
  const navigate = useViewTransitionNavigate();
  const {
    tournaments,
    integrations,
    storageStatus: tournamentStorageStatus,
    storageError: tournamentStorageError,
  } = useTournaments();
  const {
    leagues,
    storageStatus: leagueStorageStatus,
    storageError: leagueStorageError,
  } = useLeagues();
  const viewModel = useMemo(
    () => buildHomeViewModel(tournaments, leagues, integrations),
    [integrations, leagues, tournaments],
  );
  const recentItemsLoading = tournamentStorageStatus === "loading" || leagueStorageStatus === "loading";

  return (
    <div className="page-stack home-page">
      <section className="home-heading">
        <h1>トーナメント・リーグ表</h1>
        <p>トーナメント表とリーグ表を、ブラウザだけで作成・管理できます。</p>
      </section>

      <section className="home-feature-grid" aria-label="主要機能">
        <HomeFeatureCard
          title="トーナメント"
          description="参加者名簿からトーナメント表を作成します。"
          status={tournamentStorageStatus}
          error={tournamentStorageError}
          counts={viewModel.tournament}
          onCreate={() => navigate("/tournaments/new")}
          onOpenList={() => navigate("/tournaments")}
        />
        <HomeFeatureCard
          title="リーグ"
          description="グループ分け、対戦カード、リーグ表を作成します。"
          status={leagueStorageStatus}
          error={leagueStorageError}
          counts={viewModel.league}
          onCreate={() => navigate("/leagues/new")}
          onOpenList={() => navigate("/leagues")}
        />
      </section>

      <section className="home-recent-section" aria-labelledby="home-recent-title" aria-busy={recentItemsLoading || undefined}>
        <div className="home-section-heading">
          <h2 id="home-recent-title">最近更新したデータ</h2>
        </div>
        {recentItemsLoading ? (
          <p className="home-status-message" role="status">保存済みデータを読み込んでいます。</p>
        ) : viewModel.recentItems.length === 0 ? (
          <p className="home-status-message">最近更新したデータはありません。</p>
        ) : (
          <ul className="home-recent-list">
            {viewModel.recentItems.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="home-recent-item">
                <div className="home-recent-copy">
                  <div className="home-recent-primary">
                    <span className="home-recent-type">{item.kind === "tournament" ? "トーナメント" : "リーグ"}</span>
                    <strong title={item.title}>{item.title}</strong>
                  </div>
                  <div className="home-recent-meta">
                    <span>{item.date}</span>
                    <span className={`status-badge ${item.status === "編集中" ? "draft" : "generated"}`}>{item.status}</span>
                    <span className="muted-line">最終更新 {formatDateTime(item.updatedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="home-recent-open"
                  aria-label={`${item.title}を開く`}
                  onClick={() => navigate(item.resumePath)}
                >
                  開く <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PwaInstallGuide />

      <section className="home-storage-note" aria-label="データ保存案内">
        <strong>データ保存について</strong>
        <p>データはこのブラウザ内に保存され、外部へ自動送信されません。対応環境ではオフラインでも利用できます。</p>
      </section>
    </div>
  );
}

function HomeFeatureCard({
  title,
  description,
  status,
  error,
  counts,
  onCreate,
  onOpenList,
}: {
  title: string;
  description: string;
  status: HomeStorageStatus;
  error?: string;
  counts: HomeViewModel["tournament"];
  onCreate: () => void;
  onOpenList: () => void;
}) {
  const isReady = status === "ready";

  return (
    <article className="home-feature-card" aria-busy={status === "loading" || undefined}>
      <div className="home-feature-card-heading">
        <h2>{title}</h2>
        <div className="home-feature-card-total">
          <span className="home-feature-card-count">{counts.total}件</span>
          <StorageState status={status} />
        </div>
      </div>
      <p>{description}</p>
      <dl className="home-status-list" aria-label={`${title}の状態別件数`}>
        <div>
          <dt>編集中</dt>
          <dd>{counts.editing}</dd>
        </div>
        <div>
          <dt>運用中</dt>
          <dd>{counts.operating}</dd>
        </div>
        <div>
          <dt>完了</dt>
          <dd>{counts.completed}</dd>
        </div>
      </dl>
      {status === "error" ? <p className="home-card-error" role="alert">{error || "保存データを利用できません。"}</p> : null}
      <div className="button-row home-feature-actions">
        <button type="button" className="button primary" disabled={!isReady} onClick={onCreate}>
          新規作成
        </button>
        <button type="button" className="home-list-link" onClick={onOpenList}>
          一覧を開く <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}

function StorageState({ status }: { status: HomeStorageStatus }) {
  if (status === "loading") return <span className="home-storage-state">読み込み中</span>;
  if (status === "error") return <span className="home-storage-state error">利用不可</span>;
  if (status === "saving") return <span className="home-storage-state">保存中</span>;
  return null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}
