import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { completeLeague, reopenLeague, updateManualRank, updateMatch } from "../app/leagueModel";
import { validateManualRanks } from "../domain/leagueLogic";
import type { LeagueMatchResult } from "../domain/leagueTypes";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";

type DashboardTab = "matches" | "results";

export function LeagueDashboardPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague: saveLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [groupId, setGroupId] = useState(league?.groups[0]?.id ?? "");
  const [tab, setTab] = useState<DashboardTab>("matches");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [completionAttempted, setCompletionAttempted] = useState(false);

  if (!league) return <LeagueNotFound />;
  const activeGroupId = league.groups.some((group) => group.id === groupId) ? groupId : league.groups[0]?.id ?? "";
  const activeGroup = league.groups.find((group) => group.id === activeGroupId);
  const activeParticipantIds = activeGroup?.participantIds ?? [];
  const activeMatches = league.matches.filter((match) => match.groupId === activeGroupId);
  const activeStandings = league.standings.filter((standing) => standing.groupId === activeGroupId);
  const completionValidation = validateManualRanks(league);
  const readOnly = league.status === "completed";

  const saveResult = (matchId: string, result: LeagueMatchResult) => {
    if (readOnly) return;
    saveLeague(updateMatch(league, matchId, { result }));
  };

  const saveNote = (matchId: string, note: string) => {
    if (readOnly) return;
    saveLeague(updateMatch(league, matchId, { note }));
  };

  const saveRank = (participantId: string, value: string) => {
    if (readOnly) return;
    const parsed = value.trim() ? Number(value) : undefined;
    saveLeague(updateManualRank(league, participantId, parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined));
  };

  const handleComplete = () => {
    if (completionValidation.errors.length > 0) {
      setCompletionAttempted(true);
      return;
    }
    saveLeague(completeLeague(league));
  };

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="グループごとの順位表、星取表、対戦カードを切り替えて確認・運用します。" actions={readOnly ? <button type="button" className="button primary" title="リーグを編集できる状態に戻す" onClick={() => setReopenOpen(true)}>編集を再開</button> : <button type="button" className="button primary" title="順位を確認してリーグを完了する" onClick={handleComplete}>リーグを完了</button>} />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {readOnly ? <section className="flow-notice" role="status">このリーグは完了済みです。内容は読み取り専用です。</section> : null}
      {!readOnly && completionAttempted && completionValidation.errors.length > 0 ? <LeagueValidationBanner errors={completionValidation.errors} /> : null}
      <section className="league-dashboard-group-panel" aria-label="グループ選択"><div className="group-tabs" role="tablist" aria-label="グループ"><span className="tab-label">グループ</span><div className="group-tab-segment">{league.groups.map((group) => <button type="button" role="tab" aria-selected={group.id === activeGroupId} className={group.id === activeGroupId ? "tab active" : "tab"} key={group.id} onClick={() => setGroupId(group.id)}>{group.name}</button>)}</div></div></section>
      <section className="league-dashboard-content-panel" aria-label="リーグ表示"><div className="view-tabs" role="tablist" aria-label="表示"><button type="button" role="tab" id="league-dashboard-matches-tab" aria-controls="league-dashboard-matches-panel" aria-selected={tab === "matches"} className={tab === "matches" ? "view-tab active" : "view-tab"} onClick={() => setTab("matches")}>対戦カード</button><button type="button" role="tab" id="league-dashboard-results-tab" aria-controls="league-dashboard-results-panel" aria-selected={tab === "results"} className={tab === "results" ? "view-tab active" : "view-tab"} onClick={() => setTab("results")}>対戦結果</button></div>{tab === "matches" ? <div id="league-dashboard-matches-panel" role="tabpanel" aria-labelledby="league-dashboard-matches-tab"><MatchesView league={league} matches={activeMatches} readOnly={readOnly} onResultChange={saveResult} onNoteChange={saveNote} /></div> : <div id="league-dashboard-results-panel" className="league-results-stack" role="tabpanel" aria-labelledby="league-dashboard-results-tab"><MatrixView league={league} participantIds={activeParticipantIds} matches={activeMatches} /><StandingsView league={league} participantIds={activeParticipantIds} standings={activeStandings} readOnly={readOnly} onRankChange={saveRank} /></div>}</section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" disabled={readOnly} title={readOnly ? "完了済みリーグは対戦カード設定へ戻れません" : "対戦カード設定へ戻る"} onClick={() => navigate(`/leagues/${league.id}/edit/matches`)}>戻る</button><button type="button" className="button secondary" title="リーグ一覧へ戻る" onClick={() => navigate("/leagues")}>一覧</button></div>
      <ConfirmDialog open={reopenOpen} title="完了済みリーグの編集を再開します" message="リーグを編集中に戻します。結果、備考、順位、有効カード状態は保持されます。" confirmLabel="編集を再開" cancelLabel="キャンセル" onCancel={() => setReopenOpen(false)} onConfirm={() => { saveLeague(reopenLeague(league)); setReopenOpen(false); }} />
    </div>
  );
}

function StandingsView({ league, participantIds, standings, readOnly, onRankChange }: { league: NonNullable<ReturnType<typeof useLeague>>; participantIds: string[]; standings: NonNullable<ReturnType<typeof useLeague>>["standings"]; readOnly: boolean; onRankChange: (participantId: string, value: string) => void }) {
  const rows = [...standings].sort((left, right) => (left.manualRank ?? 999) - (right.manualRank ?? 999) || right.points - left.points);
  return <section className="section-card"><div className="section-card-heading"><div><h2>順位表</h2><p>勝点による集計と、運営者が指定する手動順位を別々に表示します。</p></div></div><div className="table-panel"><table className="data-table league-standings-table"><thead><tr><th>手動順位</th><th>参加者</th><th>試合</th><th>勝</th><th>分</th><th>負</th><th>勝点</th></tr></thead><tbody>{rows.filter((standing) => participantIds.includes(standing.participantId)).map((standing) => { const participant = league.participants.find((item) => item.id === standing.participantId); return <tr key={standing.participantId}><td><input className="short-input" type="number" min="1" step="1" value={standing.manualRank ?? ""} disabled={readOnly} aria-label={`${ParticipantLabel(participant)}の手動順位`} onChange={(event) => onRankChange(standing.participantId, event.target.value)} /></td><td><span className="participant-readonly league-participant-label">{participant ? ParticipantLabel(participant) : "名称未設定"}</span></td><td>{standing.played}</td><td>{standing.wins}</td><td>{standing.draws}</td><td>{standing.losses}</td><td><strong>{standing.points}</strong></td></tr>; })}</tbody></table></div></section>;
}

function MatchesView({ league, matches, readOnly, onResultChange, onNoteChange }: { league: NonNullable<ReturnType<typeof useLeague>>; matches: NonNullable<ReturnType<typeof useLeague>>["matches"]; readOnly: boolean; onResultChange: (matchId: string, result: LeagueMatchResult) => void; onNoteChange: (matchId: string, note: string) => void }) {
  return <section className="section-card"><div className="section-card-heading"><div><h2>対戦カード</h2><p>結果入力はこの一覧から行います。無効カードは集計対象外ですが、入力済みデータを保持します。</p></div></div><div className="league-match-cards">{matches.map((match) => { const left = league.participants.find((participant) => participant.id === match.participantAId); const right = league.participants.find((participant) => participant.id === match.participantBId); return <article className={`league-match-card${match.isValid ? "" : " is-invalid"}`} key={match.id}><div className="match-card-heading"><strong>第{match.order}試合</strong><span className={`status-badge ${match.isValid ? "generated" : "draft"}`}>{match.isValid ? "有効" : "無効（集計外）"}</span></div><div className="match-pair match-card-players"><span>{ParticipantLabel(left)}</span><span className="match-vs">vs</span><span>{ParticipantLabel(right)}</span></div><div className="result-toggle" role="group" aria-label={`第${match.order}試合の結果`}><ResultButton label="未実施" active={match.result === "unplayed"} disabled={readOnly} onClick={() => onResultChange(match.id, "unplayed")} /><ResultButton label="A勝" active={match.result === "participantAWin"} disabled={readOnly} onClick={() => onResultChange(match.id, "participantAWin")} /><ResultButton label="引き分け" active={match.result === "draw"} disabled={readOnly} onClick={() => onResultChange(match.id, "draw")} /><ResultButton label="B勝" active={match.result === "participantBWin"} disabled={readOnly} onClick={() => onResultChange(match.id, "participantBWin")} /></div><label className="field"><span>備考</span><input value={match.note ?? ""} disabled={readOnly} onChange={(event) => onNoteChange(match.id, event.target.value)} /></label></article>; })}</div></section>;
}

function ResultButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "result-button active" : "result-button"} aria-pressed={active} disabled={disabled} onClick={onClick}>{label}</button>;
}

function MatrixView({ league, participantIds, matches }: { league: NonNullable<ReturnType<typeof useLeague>>; participantIds: string[]; matches: NonNullable<ReturnType<typeof useLeague>>["matches"] }) {
  const getParticipantLabel = (participantId: string) => { const participant = league.participants.find((item) => item.id === participantId); return participant ? ParticipantLabel(participant) : "名称未設定"; };
  const getResult = (leftId: string, rightId: string) => { const match = matches.find((item) => (item.participantAId === leftId && item.participantBId === rightId) || (item.participantAId === rightId && item.participantBId === leftId)); if (!match) return "-"; if (!match.isValid) return "無"; if (match.result === "unplayed") return "未"; if (match.result === "draw") return "分"; return match.participantAId === leftId ? "勝" : "負"; };
  return <section className="section-card"><div className="section-card-heading"><div><h2>星取表</h2><p>閲覧専用。結果の入力は対戦カードタブから行います。</p></div></div><div className="table-panel matrix-panel"><table className="data-table league-matrix"><thead><tr><th>参加者</th>{participantIds.map((id) => <th key={id}><span className="league-participant-label">{league.participants.find((participant) => participant.id === id)?.displayName || "名称未設定"}</span></th>)}</tr></thead><tbody>{participantIds.map((rowId) => <tr key={rowId}><th scope="row"><span className="league-participant-label">{getParticipantLabel(rowId)}</span></th>{participantIds.map((columnId) => <td key={columnId}>{rowId === columnId ? "—" : getResult(rowId, columnId)}</td>)}</tr>)}</tbody></table></div></section>;
}
