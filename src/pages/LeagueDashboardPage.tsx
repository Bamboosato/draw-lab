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

type DashboardTab = "standings" | "matrix" | "matches";

export function LeagueDashboardPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague: saveLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [groupId, setGroupId] = useState(league?.groups[0]?.id ?? "");
  const [tab, setTab] = useState<DashboardTab>("standings");
  const [reopenOpen, setReopenOpen] = useState(false);

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

  const saveName = (participantId: string, displayName: string) => {
    if (readOnly) return;
    saveLeague({
      ...league,
      participants: league.participants.map((participant) => participant.id === participantId
        ? { ...participant, displayName, memberNames: participant.participantType === "individual" ? [displayName] : participant.memberNames }
        : participant),
    });
  };

  const saveRank = (participantId: string, value: string) => {
    if (readOnly) return;
    const parsed = value.trim() ? Number(value) : undefined;
    saveLeague(updateManualRank(league, participantId, parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined));
  };

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="グループごとの順位表、星取表、対戦カードを切り替えて確認・運用します。" actions={<><button type="button" className="button secondary" disabled={readOnly} onClick={() => navigate(`/leagues/${league.id}/edit/matches`)}>対戦カード設定</button>{readOnly ? <button type="button" className="button primary" onClick={() => setReopenOpen(true)}>編集を再開</button> : <button type="button" className="button primary" disabled={completionValidation.errors.length > 0} onClick={() => saveLeague(completeLeague(league))}>リーグを完了</button>}</>} />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {readOnly ? <section className="flow-notice" role="status">このリーグは完了済みです。内容は読み取り専用です。</section> : null}
      {!readOnly && completionValidation.errors.length > 0 ? <LeagueValidationBanner errors={completionValidation.errors} /> : null}
      <section className="league-dashboard-tabs" aria-label="リーグ表示切り替え"><div className="group-tabs" role="tablist" aria-label="グループ"><span className="tab-label">グループ</span>{league.groups.map((group) => <button type="button" role="tab" aria-selected={group.id === activeGroupId} className={group.id === activeGroupId ? "tab active" : "tab"} key={group.id} onClick={() => setGroupId(group.id)}>{group.name}</button>)}</div><div className="view-tabs" role="tablist" aria-label="表示"><button type="button" role="tab" aria-selected={tab === "standings"} className={tab === "standings" ? "tab active" : "tab"} onClick={() => setTab("standings")}>順位表</button><button type="button" role="tab" aria-selected={tab === "matrix"} className={tab === "matrix" ? "tab active" : "tab"} onClick={() => setTab("matrix")}>星取表</button><button type="button" role="tab" aria-selected={tab === "matches"} className={tab === "matches" ? "tab active" : "tab"} onClick={() => setTab("matches")}>対戦カード</button></div></section>
      {tab === "standings" ? <StandingsView league={league} participantIds={activeParticipantIds} standings={activeStandings} readOnly={readOnly} onRankChange={saveRank} onNameChange={saveName} /> : tab === "matrix" ? <MatrixView league={league} participantIds={activeParticipantIds} matches={activeMatches} /> : <MatchesView league={league} matches={activeMatches} readOnly={readOnly} onResultChange={saveResult} onNoteChange={saveNote} />}
      <ConfirmDialog open={reopenOpen} title="完了済みリーグの編集を再開します" message="リーグを編集中に戻します。結果、備考、順位、有効カード状態は保持されます。" confirmLabel="編集を再開" cancelLabel="キャンセル" onCancel={() => setReopenOpen(false)} onConfirm={() => { saveLeague(reopenLeague(league)); setReopenOpen(false); }} />
    </div>
  );
}

function StandingsView({ league, participantIds, standings, readOnly, onRankChange, onNameChange }: { league: NonNullable<ReturnType<typeof useLeague>>; participantIds: string[]; standings: NonNullable<ReturnType<typeof useLeague>>["standings"]; readOnly: boolean; onRankChange: (participantId: string, value: string) => void; onNameChange: (participantId: string, value: string) => void }) {
  const rows = [...standings].sort((left, right) => (left.manualRank ?? 999) - (right.manualRank ?? 999) || right.points - left.points);
  return <section className="section-card"><div className="section-card-heading"><div><h2>順位表</h2><p>勝点による集計と、運営者が指定する手動順位を別々に表示します。</p></div></div><div className="table-panel"><table className="data-table league-standings-table"><thead><tr><th>手動順位</th><th>参加単位</th><th>試合</th><th>勝</th><th>分</th><th>負</th><th>勝点</th></tr></thead><tbody>{rows.filter((standing) => participantIds.includes(standing.participantId)).map((standing) => { const participant = league.participants.find((item) => item.id === standing.participantId); return <tr key={standing.participantId}><td><input className="short-input" type="number" min="1" step="1" value={standing.manualRank ?? ""} disabled={readOnly} aria-label={`${ParticipantLabel(participant)}の手動順位`} onChange={(event) => onRankChange(standing.participantId, event.target.value)} /></td><td><input value={participant?.displayName ?? ""} disabled={readOnly} aria-label={`${ParticipantLabel(participant)}の表示名`} onChange={(event) => onNameChange(standing.participantId, event.target.value)} /><span className="muted-line">{participant ? ParticipantLabel(participant) : ""}</span></td><td>{standing.played}</td><td>{standing.wins}</td><td>{standing.draws}</td><td>{standing.losses}</td><td><strong>{standing.points}</strong></td></tr>; })}</tbody></table></div></section>;
}

function MatchesView({ league, matches, readOnly, onResultChange, onNoteChange }: { league: NonNullable<ReturnType<typeof useLeague>>; matches: NonNullable<ReturnType<typeof useLeague>>["matches"]; readOnly: boolean; onResultChange: (matchId: string, result: LeagueMatchResult) => void; onNoteChange: (matchId: string, note: string) => void }) {
  return <section className="section-card"><div className="section-card-heading"><div><h2>対戦カード</h2><p>結果入力はこの一覧から行います。無効カードは集計対象外ですが、入力済みデータを保持します。</p></div></div><div className="league-match-cards">{matches.map((match) => { const left = league.participants.find((participant) => participant.id === match.participantAId); const right = league.participants.find((participant) => participant.id === match.participantBId); return <article className={`league-match-card${match.isValid ? "" : " is-invalid"}`} key={match.id}><div className="match-card-heading"><strong>第{match.order}試合</strong><span className={`status-badge ${match.isValid ? "generated" : "draft"}`}>{match.isValid ? "有効" : "無効（集計外）"}</span></div><div className="match-card-players"><span>{ParticipantLabel(left)}</span><span className="match-vs">vs</span><span>{ParticipantLabel(right)}</span></div><div className="result-toggle" role="group" aria-label={`第${match.order}試合の結果`}><ResultButton label="未実施" active={match.result === "unplayed"} disabled={readOnly} onClick={() => onResultChange(match.id, "unplayed")} /><ResultButton label="A勝" active={match.result === "participantAWin"} disabled={readOnly} onClick={() => onResultChange(match.id, "participantAWin")} /><ResultButton label="引き分け" active={match.result === "draw"} disabled={readOnly} onClick={() => onResultChange(match.id, "draw")} /><ResultButton label="B勝" active={match.result === "participantBWin"} disabled={readOnly} onClick={() => onResultChange(match.id, "participantBWin")} /></div><label className="field"><span>備考</span><input value={match.note ?? ""} disabled={readOnly} onChange={(event) => onNoteChange(match.id, event.target.value)} /></label></article>; })}</div></section>;
}

function ResultButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "result-button active" : "result-button"} aria-pressed={active} disabled={disabled} onClick={onClick}>{label}</button>;
}

function MatrixView({ league, participantIds, matches }: { league: NonNullable<ReturnType<typeof useLeague>>; participantIds: string[]; matches: NonNullable<ReturnType<typeof useLeague>>["matches"] }) {
  const getResult = (leftId: string, rightId: string) => { const match = matches.find((item) => item.isValid && ((item.participantAId === leftId && item.participantBId === rightId) || (item.participantAId === rightId && item.participantBId === leftId))); if (!match) return "-"; if (match.result === "unplayed") return "未"; if (match.result === "draw") return "分"; return match.participantAId === leftId ? "勝" : "負"; };
  return <section className="section-card"><div className="section-card-heading"><div><h2>星取表</h2><p>閲覧専用。結果の入力は対戦カードタブから行います。</p></div></div><div className="table-panel matrix-panel"><table className="data-table league-matrix"><thead><tr><th>参加単位</th>{participantIds.map((id) => <th key={id}>{league.participants.find((participant) => participant.id === id)?.displayName || "名称未設定"}</th>)}</tr></thead><tbody>{participantIds.map((rowId) => <tr key={rowId}><th scope="row">{league.participants.find((participant) => participant.id === rowId)?.displayName || "名称未設定"}</th>{participantIds.map((columnId) => <td key={columnId}>{rowId === columnId ? "—" : getResult(rowId, columnId)}</td>)}</tr>)}</tbody></table></div></section>;
}
