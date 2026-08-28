import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { markMatchSelectionConfirmed, prepareLeagueMatches, updateMatchValidity } from "../app/leagueModel";
import { countValidMatchesByParticipant, hasLeagueResults, validatePartialMatchSelection } from "../domain/leagueLogic";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function LeagueMatchesPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [pendingToggle, setPendingToggle] = useState<{ matchId: string; isValid: boolean }>();

  if (!league) return <LeagueNotFound />;
  const partialValidation = league.matchPolicy.mode === "partialRoundRobin" ? validatePartialMatchSelection(league) : { errors: [], warnings: [] };
  const canConfirm = league.matches.length > 0 && partialValidation.errors.length === 0;
  const confirmed = league.matchSelectionStatus === "confirmed";
  const hasResults = hasLeagueResults(league);
  const canContinue = confirmed ? league.matches.length > 0 : canConfirm;

  const generate = () => { if (!hasResults) updateLeague(prepareLeagueMatches(league)); };
  const applyToggle = (matchId: string, isValid: boolean) => updateLeague(updateMatchValidity(league, matchId, isValid));
  const requestToggle = (matchId: string, isValid: boolean) => {
    const match = league.matches.find((item) => item.id === matchId);
    if (!match || match.result === "unplayed") {
      applyToggle(matchId, isValid);
      return;
    }
    setPendingToggle({ matchId, isValid });
  };
  const confirm = () => { if (canConfirm && !confirmed) updateLeague(markMatchSelectionConfirmed(league)); };

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="対戦カードを作成し、部分当たりでは実施するカードを選択します。試合順は生成順で固定です。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      <LeagueValidationBanner errors={partialValidation.errors} warnings={partialValidation.warnings} />
      {hasResults ? <section className="flow-notice" role="status">結果入力後のため、候補カードの再生成はできません。有効／無効の変更は集計への影響を確認して行います。</section> : null}
      <section className="section-card"><div className="section-card-heading"><div><h2>候補カード</h2><p>{league.matchPolicy.mode === "roundRobin" ? "総当たりの全カード" : "総当たり相当の全候補カード。初期状態はすべて有効"}</p></div><button type="button" className="button secondary no-print" disabled={league.status === "completed" || hasResults} onClick={generate}>候補カードを再生成</button></div>{league.matches.length === 0 ? <p className="empty-inline">候補カードを生成してください。</p> : <div className="table-panel"><table className="data-table league-matches-table"><thead><tr><th>試合順</th><th>グループ</th><th>対戦カード</th><th>有効状態</th><th>有効試合数</th></tr></thead><tbody>{league.matches.map((match) => { const group = league.groups.find((item) => item.id === match.groupId); const counts = group ? countValidMatchesByParticipant(league.matches.filter((item) => item.groupId === group.id), group.participantIds) : new Map<string, number>(); return <tr className={match.isValid ? "" : "is-invalid"} key={match.id}><td>{match.order}</td><td>{group?.name ?? "-"}</td><td>{ParticipantLabel(league.participants.find((item) => item.id === match.participantAId))} <span className="match-vs">vs</span> {ParticipantLabel(league.participants.find((item) => item.id === match.participantBId))}</td><td><label className="validity-control"><input type="checkbox" checked={match.isValid} disabled={league.status === "completed" || league.matchPolicy.mode === "roundRobin"} onChange={(event) => requestToggle(match.id, event.target.checked)} /><span>{match.isValid ? "有効" : "無効"}</span></label></td><td className="match-count-cell">{league.matchPolicy.mode === "partialRoundRobin" ? `${counts.get(match.participantAId) ?? 0} / ${counts.get(match.participantBId) ?? 0}` : "-"}</td></tr>; })}</tbody></table></div>}</section>
      <section className="compact-summary-section"><dl className="compact-summary" aria-label="カード概要"><div className="summary-metric"><dt>候補カード</dt><dd>{league.matches.length}</dd></div><div className="summary-metric"><dt>有効カード</dt><dd>{league.matches.filter((match) => match.isValid).length}</dd></div><div className="summary-metric"><dt>無効カード</dt><dd>{league.matches.filter((match) => !match.isValid).length}</dd></div><div className={`summary-metric${confirmed ? " success" : ""}`}><dt>確定状態</dt><dd>{confirmed ? "確定" : "未確定"}</dd></div></dl></section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" onClick={() => navigate(`/leagues/${league.id}/edit/groups`)}>戻る</button><button type="button" className="button primary" disabled={!canContinue} onClick={() => { confirm(); navigate(`/leagues/${league.id}/dashboard`); }}>{confirmed ? "リーグ表を表示" : "有効カードを確定"}</button></div>
      <ConfirmDialog open={pendingToggle !== undefined} title="入力済みカードの有効状態を変更します" message="このカードには入力済みの結果があります。有効状態を変更すると、順位表・星取表の集計対象が変わります。変更しますか？" confirmLabel="変更する" cancelLabel="キャンセル" onCancel={() => setPendingToggle(undefined)} onConfirm={() => { if (pendingToggle) applyToggle(pendingToggle.matchId, pendingToggle.isValid); setPendingToggle(undefined); }} />
    </div>
  );
}
