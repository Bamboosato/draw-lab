import { Link, useNavigate } from "react-router-dom";
import { useTournaments } from "../app/TournamentProvider";
import type { Tournament } from "../domain/types";

export function TournamentListPage() {
  const navigate = useNavigate();
  const { tournaments, deleteTournament, duplicateTournament } = useTournaments();

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Tournament List</p>
          <h2>トーナメント一覧</h2>
          <p>作成済みのトーナメントを管理・編集します。</p>
        </div>
        <div className="button-row no-print">
          <Link className="button secondary" to="/import">JSONインポート</Link>
          <Link className="button primary" to="/tournaments/new">新規作成</Link>
        </div>
      </section>

      <section className="summary-grid">
        <Metric label="全トーナメント" value={String(tournaments.length)} />
        <Metric label="生成済み" value={String(tournaments.filter((item) => item.generatedDraw).length)} />
        <Metric label="編集中" value={String(tournaments.filter((item) => !item.generatedDraw).length)} />
        <Metric label="保存先" value="localStorage" />
      </section>

      {tournaments.length === 0 ? (
        <section className="empty-state">
          <h3>保存済みのトーナメントはありません。</h3>
          <p>新規作成またはJSONインポートから開始してください。</p>
        </section>
      ) : (
        <section className="table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>大会名</th>
                <th>種目</th>
                <th>開催日</th>
                <th>サイズ</th>
                <th>状態</th>
                <th>最終更新</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => (
                <tr key={tournament.id}>
                  <td>
                    <strong>{tournament.title || "無題のトーナメント"}</strong>
                    <span className="muted-line">{tournament.venue || "会場未設定"}</span>
                  </td>
                  <td>
                    {tournament.eventName || "-"}
                    <span className="muted-line">{tournament.matchType === "doubles" ? "ダブルス" : "シングルス"}</span>
                  </td>
                  <td>{tournament.date || "-"}</td>
                  <td>{tournament.drawSize}枠</td>
                  <td><StatusBadge tournament={tournament} /></td>
                  <td>{formatDateTime(tournament.updatedAt)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => navigate(`/tournaments/${tournament.id}/edit/basic`)}>編集</button>
                      <button
                        type="button"
                        disabled={!tournament.generatedDraw}
                        onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}
                      >
                        プレビュー
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const duplicated = duplicateTournament(tournament.id);
                          if (duplicated) {
                            navigate(`/tournaments/${duplicated.id}/edit/basic`);
                          }
                        }}
                      >
                        複製
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => {
                          if (window.confirm("このトーナメントを削除しますか？")) {
                            deleteTournament(tournament.id);
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ tournament }: { tournament: Tournament }) {
  return <span className={`status-badge ${tournament.generatedDraw ? "generated" : "draft"}`}>{tournament.generatedDraw ? "生成済み" : "未生成"}</span>;
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
