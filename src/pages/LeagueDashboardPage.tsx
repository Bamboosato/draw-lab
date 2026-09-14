import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import {
  completeLeague,
  reopenLeague,
  updateDetailDisplayEnabled,
  updateDetailInputEnabled,
  updateManualRanks,
  updateMatch,
  updateMatchSetScore,
} from "../app/leagueModel";
import { calculateAutomaticRanks, getActiveMatchOrders, getEffectiveLeagueRank, validateManualRanks } from "../domain/leagueLogic";
import { buildLeagueMatrixPrintPages, type LeaguePrintResultMode } from "../domain/leaguePrint";
import { getSetCount, type LeagueMatch, type LeagueMatchResult, type LeagueValidationIssue } from "../domain/leagueTypes";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";
import { LeagueMatrixPrintDocument } from "../components/LeagueMatrixPrintDocument";
import { MatchWinnerSelector } from "../components/MatchWinnerSelector";
import { SetScoreEditor } from "../components/SetScoreEditor";
import { buildLeaguePrintFilename, printWithFilename } from "../utils/print";

type DashboardTab = "matches" | "results";

export function LeagueDashboardPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague: saveLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [groupId, setGroupId] = useState(league?.groups[0]?.id ?? "");
  const [tab, setTab] = useState<DashboardTab>("results");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [detailDisableOpen, setDetailDisableOpen] = useState(false);
  const [printModeOpen, setPrintModeOpen] = useState(false);
  const [printResultMode, setPrintResultMode] = useState<LeaguePrintResultMode>("blank");
  const [completionAttempted, setCompletionAttempted] = useState(false);

  useEffect(() => {
    if (tab !== "matches" || !pendingMatchId) return;
    const target = document.getElementById(`league-match-${pendingMatchId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    setHighlightedMatchId(pendingMatchId);
    setPendingMatchId(null);
  }, [pendingMatchId, tab]);

  useEffect(() => {
    if (!highlightedMatchId) return;
    const timeoutId = window.setTimeout(() => setHighlightedMatchId(null), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedMatchId]);

  if (!league) return <LeagueNotFound />;
  const activeGroupId = league.groups.some((group) => group.id === groupId) ? groupId : league.groups[0]?.id ?? "";
  const activeGroup = league.groups.find((group) => group.id === activeGroupId);
  const activeParticipantIds = activeGroup?.participantIds ?? [];
  const activeMatches = league.matches.filter((match) => match.groupId === activeGroupId && match.isValid);
  const activeMatchOrders = getActiveMatchOrders(league.matches);
  const activeStandings = league.standings.filter((standing) => standing.groupId === activeGroupId);
  const completionValidation = validateManualRanks(league);
  const readOnly = league.status === "completed";
  const printPages = buildLeagueMatrixPrintPages(league, activeGroupId);
  const canPrint = printPages.pages.length > 0;
  const printButtonTitle = canPrint
    ? "PDF/印刷する内容を選択"
    : "選択中グループはPDF保存または印刷の対象外です";

  const openPrintModeDialog = () => {
    if (!canPrint) return;
    setPrintResultMode("current");
    setPrintModeOpen(true);
  };

  const outputLeaguePrint = () => {
    setPrintModeOpen(false);
    printWithFilename(buildLeaguePrintFilename(league.title, activeGroup?.name ?? ""));
  };

  const saveResult = (matchId: string, result: LeagueMatchResult) => {
    if (readOnly) return;
    saveLeague(updateMatch(league, matchId, { result }));
  };

  const saveWalkover = (matchId: string, isWalkover: boolean) => {
    if (readOnly) return;
    const match = league.matches.find((item) => item.id === matchId);
    if (!match || (match.result !== "participantAWin" && match.result !== "participantBWin")) return;
    saveLeague(updateMatch(league, matchId, { isWalkover }));
  };

  const saveNote = (matchId: string, note: string) => {
    if (readOnly) return;
    saveLeague(updateMatch(league, matchId, { note }));
  };

  const saveDetailInputEnabled = (enabled: boolean) => {
    if (readOnly) return;
    if (!enabled) {
      setDetailDisableOpen(true);
      return;
    }
    saveLeague(updateDetailInputEnabled(league, true));
  };

  const disableDetailInput = () => {
    saveLeague(updateDetailInputEnabled(league, false));
    setDetailDisableOpen(false);
  };

  const saveDetailDisplayEnabled = (enabled: boolean) => {
    if (readOnly) return;
    saveLeague(updateDetailDisplayEnabled(league, enabled));
  };

  const saveSetScore = (
    matchId: string,
    setIndex: number,
    participant: "participantA" | "participantB",
    value: number | null,
  ) => {
    if (readOnly) return;
    saveLeague(updateMatchSetScore(league, matchId, setIndex, participant, value));
  };

  const saveRankCorrections = (corrections: ReadonlyMap<string, number | undefined>): LeagueValidationIssue[] => {
    if (readOnly) return [];
    const next = updateManualRanks(league, corrections);
    const validation = validateManualRanks(next);
    if (validation.errors.length > 0) return validation.errors;
    saveLeague(next);
    return [];
  };

  const openMatchFromMatrix = (matchId: string) => {
    setPendingMatchId(matchId);
    setTab("matches");
  };

  const handleComplete = () => {
    if (completionValidation.errors.length > 0) {
      setCompletionAttempted(true);
      return;
    }
    saveLeague(completeLeague(league));
  };

  return (
    <div className="page-stack league-page league-dashboard-page">
      <LeaguePageHeading
        description="グループごとの順位表、リーグ表、結果入力を切り替えて確認・運用します。"
        actions={(
          <>
            {readOnly ? <button type="button" className="button primary" title="リーグを編集できる状態に戻す" onClick={() => setReopenOpen(true)}>編集を再開</button> : <button type="button" className="button primary" title="順位を確認してリーグを完了する" onClick={handleComplete}>リーグを完了</button>}
            <button type="button" className="button secondary" title={printButtonTitle} disabled={!canPrint} onClick={openPrintModeDialog}>PDF/印刷</button>
          </>
        )}
      />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {readOnly ? <section className="flow-notice" role="status">このリーグは完了済みです。内容は読み取り専用です。</section> : null}
      {!readOnly && completionAttempted && completionValidation.errors.length > 0 ? <LeagueValidationBanner errors={completionValidation.errors} /> : null}
      <section className="league-dashboard-group-panel" aria-label="グループ選択"><div className="group-tabs" role="tablist" aria-label="グループ"><span className="tab-label">グループ</span><div className="group-tab-segment">{league.groups.map((group) => <button type="button" role="tab" aria-selected={group.id === activeGroupId} className={group.id === activeGroupId ? "tab active" : "tab"} key={group.id} onClick={() => setGroupId(group.id)}>{group.name}</button>)}</div></div></section>
      <section className="league-dashboard-content-panel" aria-label="リーグ表示"><div className="view-tabs" role="tablist" aria-label="表示"><button type="button" role="tab" id="league-dashboard-results-tab" aria-controls="league-dashboard-results-panel" aria-selected={tab === "results"} className={tab === "results" ? "view-tab active" : "view-tab"} onClick={() => setTab("results")}>リーグ表・順位表</button><button type="button" role="tab" id="league-dashboard-matches-tab" aria-controls="league-dashboard-matches-panel" aria-selected={tab === "matches"} className={tab === "matches" ? "view-tab active" : "view-tab"} onClick={() => setTab("matches")}>結果入力</button></div>{tab === "matches" ? <div id="league-dashboard-matches-panel" role="tabpanel" aria-labelledby="league-dashboard-matches-tab"><MatchesView league={league} matches={activeMatches} matchOrders={activeMatchOrders} highlightedMatchId={highlightedMatchId} readOnly={readOnly} onResultChange={saveResult} onWalkoverChange={saveWalkover} onNoteChange={saveNote} onDetailInputChange={saveDetailInputEnabled} onSetScoreChange={saveSetScore} /></div> : <div id="league-dashboard-results-panel" className="league-results-stack" role="tabpanel" aria-labelledby="league-dashboard-results-tab"><MatrixView league={league} participantIds={activeParticipantIds} matches={activeMatches} readOnly={readOnly} onDetailDisplayChange={saveDetailDisplayEnabled} onMatchSelect={openMatchFromMatrix} /><StandingsView league={league} groupId={activeGroupId} participantIds={activeParticipantIds} standings={activeStandings} readOnly={readOnly} onSaveCorrections={saveRankCorrections} /></div>}</section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" disabled={readOnly} title={readOnly ? "完了済みリーグは対戦カード設定へ戻れません" : "対戦カード設定へ戻る"} onClick={() => navigate(`/leagues/${league.id}/edit/matches`)}>戻る</button><button type="button" className="button secondary" title="リーグ一覧へ戻る" onClick={() => navigate("/leagues")}>一覧</button></div>
      <ConfirmDialog open={printModeOpen} title="PDF/印刷内容を選択" message="出力する内容を選択してください。" confirmLabel="出力する" cancelLabel="キャンセル" onCancel={() => setPrintModeOpen(false)} onConfirm={outputLeaguePrint}>
        <fieldset className="print-mode-options">
          <legend>出力内容</legend>
          <label><input type="radio" name="league-print-result-mode" value="current" checked={printResultMode === "current"} onChange={() => setPrintResultMode("current")} /><span>現在の入力内容を表示</span></label>
          <label><input type="radio" name="league-print-result-mode" value="blank" checked={printResultMode === "blank"} onChange={() => setPrintResultMode("blank")} /><span>結果を空欄で表示</span></label>
        </fieldset>
      </ConfirmDialog>
      <ConfirmDialog open={reopenOpen} title="完了済みリーグの編集を再開します" message="リーグを編集中に戻します。結果、セットスコア、備考、順位、有効カード状態、詳細設定は保持されます。" confirmLabel="編集を再開" cancelLabel="キャンセル" onCancel={() => setReopenOpen(false)} onConfirm={() => { saveLeague(reopenLeague(league)); setReopenOpen(false); }} />
      <ConfirmDialog open={detailDisableOpen} title="詳細入力をOFFします" message="入力済みのゲーム数がリセットされますが、よろしいですか？" confirmLabel="OFFにする" cancelLabel="キャンセル" onCancel={() => setDetailDisableOpen(false)} onConfirm={disableDetailInput} />
      <LeagueMatrixPrintDocument league={league} groupId={activeGroupId} resultMode={printResultMode} />
    </div>
  );
}

function StandingsView({ league, groupId, participantIds, standings, readOnly, onSaveCorrections }: { league: NonNullable<ReturnType<typeof useLeague>>; groupId: string; participantIds: string[]; standings: NonNullable<ReturnType<typeof useLeague>>["standings"]; readOnly: boolean; onSaveCorrections: (corrections: ReadonlyMap<string, number | undefined>) => LeagueValidationIssue[] }) {
  const [editing, setEditing] = useState(false);
  const [draftCorrections, setDraftCorrections] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<LeagueValidationIssue[]>([]);
  const group = { id: groupId, name: "", participantIds };
  const automaticRanks = calculateAutomaticRanks([group], standings, league.matches);
  const rows = [...standings]
    .filter((standing) => participantIds.includes(standing.participantId))
    .sort((left, right) => {
      const leftRank = getEffectiveLeagueRank(left, automaticRanks) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = getEffectiveLeagueRank(right, automaticRanks) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank
        || participantIds.indexOf(left.participantId) - participantIds.indexOf(right.participantId);
    });

  useEffect(() => {
    setEditing(false);
    setDraftCorrections({});
    setErrors([]);
  }, [groupId]);

  const startEditing = () => {
    setDraftCorrections(Object.fromEntries(rows.map((standing) => [standing.participantId, standing.manualRank === undefined ? "" : String(standing.manualRank)])));
    setErrors([]);
    setEditing(true);
  };

  const saveCorrections = () => {
    const corrections = new Map<string, number | undefined>();
    const inputErrors: LeagueValidationIssue[] = [];
    for (const standing of rows) {
      const value = draftCorrections[standing.participantId] ?? "";
      if (!value.trim()) {
        corrections.set(standing.participantId, undefined);
        continue;
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > participantIds.length) {
        inputErrors.push({ code: "MANUAL_RANK_INVALID", message: `訂正順位は1〜${participantIds.length}の整数で指定してください。`, participantId: standing.participantId });
        continue;
      }
      corrections.set(standing.participantId, parsed);
    }
    if (inputErrors.length > 0) {
      setErrors(inputErrors);
      return;
    }
    const saveErrors = onSaveCorrections(corrections);
    if (saveErrors.length > 0) {
      setErrors(saveErrors);
      return;
    }
    setErrors([]);
    setEditing(false);
  };

  return <section className="section-card"><div className="section-card-heading"><div><h2>順位表</h2><p>順位は勝点、直接対決、セット率、ゲーム率、グループ内の参加者順で自動計算します。</p></div><div className="inline-actions no-print">{editing ? <><button type="button" className="button secondary" onClick={() => { setEditing(false); setErrors([]); }}>キャンセル</button><button type="button" className="button primary" onClick={saveCorrections}>訂正を保存</button></> : <button type="button" className="button secondary" title={readOnly ? "完了済みのリーグは読み取り専用のため、順位を訂正できません。" : "自動順位を訂正する場合に、訂正順位を入力します。入力した順位は確定順位として扱われます。"} disabled={readOnly} onClick={startEditing}>訂正</button>}</div></div>{errors.length > 0 ? <LeagueValidationBanner errors={errors} /> : null}<div className="table-panel"><table className="data-table league-standings-table"><thead><tr><th className="league-participant-column">参加者</th><th>試合</th><th>勝</th><th>分</th><th>負</th><th>勝点</th><th>順位</th><th>訂正</th></tr></thead><tbody>{rows.map((standing) => { const participant = league.participants.find((item) => item.id === standing.participantId); return <tr key={standing.participantId}><td className="league-participant-column"><span className="participant-readonly league-participant-label">{participant ? ParticipantLabel(participant) : "名称未設定"}</span></td><td>{standing.played}</td><td>{standing.wins}</td><td>{standing.draws}</td><td>{standing.losses}</td><td><strong>{standing.points}</strong></td><td>{automaticRanks.get(standing.participantId) ?? standing.rank ?? "-"}</td><td>{editing ? <input className="short-input" type="number" min="1" max={participantIds.length} step="1" value={draftCorrections[standing.participantId] ?? ""} aria-label={`${ParticipantLabel(participant)}の訂正順位`} onChange={(event) => setDraftCorrections((current) => ({ ...current, [standing.participantId]: event.target.value }))} /> : standing.manualRank ?? ""}</td></tr>; })}</tbody></table></div></section>;
}

function MatchesView({ league, matches, matchOrders, highlightedMatchId, readOnly, onResultChange, onWalkoverChange, onNoteChange, onDetailInputChange, onSetScoreChange }: { league: NonNullable<ReturnType<typeof useLeague>>; matches: NonNullable<ReturnType<typeof useLeague>>["matches"]; matchOrders: ReadonlyMap<string, number>; highlightedMatchId: string | null; readOnly: boolean; onResultChange: (matchId: string, result: LeagueMatchResult) => void; onWalkoverChange: (matchId: string, isWalkover: boolean) => void; onNoteChange: (matchId: string, note: string) => void; onDetailInputChange: (enabled: boolean) => void; onSetScoreChange: (matchId: string, setIndex: number, participant: "participantA" | "participantB", value: number | null) => void }) {
  return (
    <section className="section-card">
      <div className="section-card-heading">
        <div>
          <h2>対戦カード</h2>
          <p>各試合の勝敗を選択してください。詳細入力を有効にすると、セットごとのゲーム数を入力できます。</p>
        </div>
        <label className="compact-checkbox no-print" title="ゲーム数を入力します。ONからOFFに変えると入力済みゲーム数がリセットされます。"><input type="checkbox" aria-label="詳細入力" checked={league.detailInputEnabled} disabled={readOnly} onChange={(event) => onDetailInputChange(event.target.checked)} /><span>詳細入力</span></label>
      </div>
      <div className="league-match-cards">
        {matches.map((match) => {
          const displayOrder = matchOrders.get(match.id) ?? match.order;
          const isPlayed = match.result !== "unplayed";
          const left = league.participants.find((participant) => participant.id === match.participantAId);
          const right = league.participants.find((participant) => participant.id === match.participantBId);
          return (
            <article className={`league-match-card${highlightedMatchId === match.id ? " league-match-card-target" : ""}`} id={`league-match-${match.id}`} tabIndex={-1} key={match.id}>
              <div className="match-card-heading">
                <strong className="match-order-label">第{displayOrder}試合</strong>
                <span className={`status-badge ${isPlayed ? "league-match-status-confirmed" : "generated"}`}>{isPlayed ? "実施済" : "未実施"}</span>
              </div>
              <MatchWinnerSelector
                ariaLabel={`第${displayOrder}試合の結果`}
                participantALabel={ParticipantLabel(left)}
                participantBLabel={ParticipantLabel(right)}
                result={match.result}
                disabled={readOnly}
                onResultChange={(result) => onResultChange(match.id, result)}
              />
              {league.detailInputEnabled ? <SetScoreEditor setScores={match.setScores} matchFormat={league.matchFormat} displayOrder={displayOrder} readOnly={readOnly} walkover={Boolean(match.isWalkover)} canMarkWalkover={match.result === "participantAWin" || match.result === "participantBWin"} onWalkoverChange={(isWalkover) => onWalkoverChange(match.id, isWalkover)} onChange={(setIndex, participant, value) => onSetScoreChange(match.id, setIndex, participant, value)} /> : null}
              <label className="field">
                <span>備考</span>
                <input className="match-note-input" placeholder="試合に関する補足を入力してください（任意）" value={match.note ?? ""} disabled={readOnly} onChange={(event) => onNoteChange(match.id, event.target.value)} />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MatrixView({ league, participantIds, matches, readOnly, onDetailDisplayChange, onMatchSelect }: { league: NonNullable<ReturnType<typeof useLeague>>; participantIds: string[]; matches: NonNullable<ReturnType<typeof useLeague>>["matches"]; readOnly: boolean; onDetailDisplayChange: (enabled: boolean) => void; onMatchSelect: (matchId: string) => void }) {
  const getParticipantLabel = (participantId: string) => { const participant = league.participants.find((item) => item.id === participantId); return participant ? ParticipantLabel(participant) : "名称未設定"; };
   return <section className="section-card"><div className="section-card-heading"><div><h2>リーグ表</h2><p>閲覧専用。結果の入力は結果入力タブから行います。</p></div><label className="compact-checkbox no-print" title="ゲーム数を表示します。対戦カードの詳細入力ON時のみ利用できます。"><input type="checkbox" aria-label="詳細表示" checked={league.detailDisplayEnabled} disabled={readOnly || !league.detailInputEnabled} onChange={(event) => onDetailDisplayChange(event.target.checked)} /><span>詳細表示</span></label></div><div className="table-panel matrix-panel"><table className="data-table league-matrix"><thead><tr><th className="league-participant-column">参加者</th>{participantIds.map((id) => <th key={id}><span className="league-participant-label">{league.participants.find((participant) => participant.id === id)?.displayName || "名称未設定"}</span></th>)}</tr></thead><tbody>{participantIds.map((rowId) => <tr key={rowId}><th className="league-participant-column" scope="row"><span className="league-participant-label">{getParticipantLabel(rowId)}</span></th>{participantIds.map((columnId) => { const isDiagonal = rowId === columnId; return <td className={isDiagonal ? "league-matrix-diagonal-cell" : undefined} key={columnId}>{isDiagonal ? <LeagueMatrixDiagonalLine /> : renderMatrixCell(league, matches, rowId, columnId, onMatchSelect, `${getParticipantLabel(rowId)}対${getParticipantLabel(columnId)}の結果入力へ移動`)}</td>; })}</tr>)}</tbody></table></div></section>;
}

function renderMatrixCell(league: NonNullable<ReturnType<typeof useLeague>>, matches: readonly LeagueMatch[], rowId: string, columnId: string, onMatchSelect: (matchId: string) => void, ariaLabel: string): ReactNode {
  const match = matches.find((item) => (item.participantAId === rowId && item.participantBId === columnId) || (item.participantAId === columnId && item.participantBId === rowId));
  const result = getMatrixResult(match, rowId);
  const content = !league.detailDisplayEnabled
    ? result
    : <span className="league-matrix-cell-content"><span className="league-matrix-result-symbol">{result}</span>{match?.isWalkover ? <span className="league-matrix-set-score">WO</span> : Array.from({ length: getSetCount(league.matchFormat) }, (_, setIndex) => getMatrixScore(match, rowId, setIndex)).map((detail, index) => <span className="league-matrix-set-score" key={index}>{detail}</span>)}</span>;
  if (!match || !match.isValid) return content;
  return <button type="button" className="league-matrix-match-link" aria-label={ariaLabel} onClick={() => onMatchSelect(match.id)}>{content}</button>;
}

function getMatrixResult(match: LeagueMatch | undefined, rowId: string): string {
  if (!match || !match.isValid) return "-";
  if (match.result === "unplayed") return "未";
  if (match.result === "draw") return "△";
  if (match.result === "participantAWin") return match.participantAId === rowId ? "○" : "●";
  return match.participantAId === rowId ? "●" : "○";
}

function getMatrixScore(match: LeagueMatch | undefined, rowId: string, setIndex: number): string {
  if (!match || !match.isValid || match.result === "unplayed") return "-";
  const score = match.setScores?.[setIndex];
  if (!score || score.participantA === null || score.participantB === null) return "-";
  return match.participantAId === rowId ? `${score.participantA}-${score.participantB}` : `${score.participantB}-${score.participantA}`;
}

function LeagueMatrixDiagonalLine() {
  return (
    <svg className="league-matrix-diagonal-line" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <line x1="0" y1="0" x2="100" y2="100" />
    </svg>
  );
}
