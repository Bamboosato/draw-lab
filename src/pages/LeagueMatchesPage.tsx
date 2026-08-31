import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { markMatchSelectionConfirmed, prepareLeagueMatches, unconfirmMatchSelection, updateMatchValidity } from "../app/leagueModel";
import { countValidMatchesByParticipant, hasLeagueResults } from "../domain/leagueLogic";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function LeagueMatchesPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [unconfirmOpen, setUnconfirmOpen] = useState(false);

  if (!league) return <LeagueNotFound />;
  const canConfirm = league.matches.length > 0;
  const confirmed = league.matchSelectionStatus === "confirmed";
  const hasResults = hasLeagueResults(league);
  const canContinue = confirmed && league.matches.length > 0;
  const completed = league.status === "completed";

  const generate = () => { if (!confirmed && !completed) updateLeague(prepareLeagueMatches(league)); };
  const applyToggle = (matchId: string, isValid: boolean) => updateLeague(updateMatchValidity(league, matchId, isValid));
  const confirm = () => { if (canConfirm && !confirmed && !completed) updateLeague(markMatchSelectionConfirmed(league)); };
  const requestUnconfirm = () => {
    if (!confirmed || completed) return;
    if (hasResults) {
      setUnconfirmOpen(true);
      return;
    }
    updateLeague(unconfirmMatchSelection(league));
  };
  const unconfirm = () => {
    updateLeague(unconfirmMatchSelection(league));
    setUnconfirmOpen(false);
  };

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="グループ内の全組み合わせを対戦カードとして作成し、必要なカードだけを無効にします。試合順は生成順で固定です。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} showSaving={false} />
      {confirmed && !completed ? <section className="flow-notice" role="status">対戦カード確定後は、対戦カードの再生成と有効／無効の変更はできません。変更する場合は、確定を解除してください。</section> : null}
      <section className="compact-summary-section">
        <dl className="compact-summary" aria-label="カード概要">
          <div className="summary-metric"><dt>対戦カード</dt><dd>{league.matches.length}</dd></div>
          <div className="summary-metric"><dt>有効カード</dt><dd>{league.matches.filter((match) => match.isValid).length}</dd></div>
          <div className="summary-metric"><dt>無効カード</dt><dd>{league.matches.filter((match) => !match.isValid).length}</dd></div>
          <div className="summary-metric"><dt>確定状態</dt><dd><span className={`status-badge ${confirmed ? "league-match-status-confirmed" : "league-match-status-pending"}`}>{confirmed ? "確定" : "未確定"}</span></dd></div>
        </dl>
      </section>
      <section className="section-card">
        <div className="section-card-heading">
          <div>
            <h2>対戦カード</h2>
            <p>グループ内の全組み合わせを対戦カードとして作成します。初期状態はすべて有効です。</p>
          </div>
          <div className="inline-actions no-print">
            <button type="button" className="button secondary" disabled={completed || confirmed} onClick={generate}>対戦カードを再生成</button>
            {confirmed
              ? <button type="button" className="button primary" title="対戦カードの確定を解除" disabled={completed} onClick={requestUnconfirm}>確定解除</button>
              : <button type="button" className="button primary" title="対戦カードを確定してリーグ表へ進める" disabled={completed || !canConfirm} onClick={confirm}>対戦カードを確定</button>}
          </div>
        </div>
        {league.matches.length === 0 ? <p className="empty-inline">対戦カードを生成してください。</p> : (
          <div className="table-panel">
            <table className="data-table league-matches-table">
              <thead><tr><th>試合順</th><th>グループ</th><th>対戦カード</th><th>有効状態</th><th>有効試合数</th></tr></thead>
              <tbody>
                {league.matches.map((match) => {
                  const group = league.groups.find((item) => item.id === match.groupId);
                  const counts = group
                    ? countValidMatchesByParticipant(league.matches.filter((item) => item.groupId === group.id), group.participantIds)
                    : new Map<string, number>();
                  return (
                    <tr className={match.isValid ? "" : "is-invalid"} key={match.id}>
                      <td>{match.order}</td>
                      <td>{group?.name ?? "-"}</td>
                      <td><span className="match-pair"><span>{ParticipantLabel(league.participants.find((item) => item.id === match.participantAId))}</span><span className="match-vs">vs</span><span>{ParticipantLabel(league.participants.find((item) => item.id === match.participantBId))}</span></span></td>
                      <td><label className="validity-control"><input type="checkbox" checked={match.isValid} disabled={completed || confirmed} onChange={(event) => applyToggle(match.id, event.target.checked)} /><span>{match.isValid ? "有効" : "無効"}</span></label></td>
                      <td className="match-count-cell">{counts.get(match.participantAId) ?? 0} / {counts.get(match.participantBId) ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" title="グループ設定へ戻る" onClick={() => navigate(`/leagues/${league.id}/edit/groups`)}>戻る</button><button type="button" className="button primary" title={confirmed ? "リーグ表へ進む" : "対戦カードを確定するとリーグ表へ進めます"} disabled={!canContinue} onClick={() => navigate(`/leagues/${league.id}/dashboard`)}>次へ</button></div>
      <ConfirmDialog open={unconfirmOpen} title="対戦カードの確定を解除します" message="対戦カードの確定を解除すると、入力済みのすべての対戦結果がリセットされます。解除してもよろしいですか？" confirmLabel="解除して結果をリセット" cancelLabel="キャンセル" onCancel={() => setUnconfirmOpen(false)} onConfirm={unconfirm} />
    </div>
  );
}
