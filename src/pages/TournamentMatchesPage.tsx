import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createRandomSeed,
  generateTournamentDraw,
  getTournamentMatchFormat,
  getTournamentMatchSelectionStatus,
  hasTournamentMatchData,
  markTournamentMatchSelectionConfirmed,
  unconfirmTournamentMatchSelection,
  updateTournamentDetailInputEnabled,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import {
  resolveTournamentMatches,
  updateTournamentMatch,
  updateTournamentMatchSetScore,
} from "../domain/tournamentMatches";
import type { Entrant, MatchType, TournamentMatchResult } from "../domain/types";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ValidationBanner } from "../components/ValidationBanner";
import { TournamentMatchCard } from "../components/TournamentMatchCard";

export function TournamentMatchesPage() {
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament, getTournamentIntegration } = useTournaments();
  const navigate = useViewTransitionNavigate();
  const [activeRound, setActiveRound] = useState(1);
  const [showIssues, setShowIssues] = useState(false);
  const [unconfirmOpen, setUnconfirmOpen] = useState(false);
  const [detailDisableOpen, setDetailDisableOpen] = useState(false);
  const integration = tournament ? getTournamentIntegration(tournament.id) : undefined;
  const validation = useMemo(
    () => tournament ? validateTournamentForUi(tournament, integration) : { errors: [], warnings: [] },
    [integration, tournament],
  );

  const matches = useMemo(
    () => tournament?.generatedDraw ? resolveTournamentMatches(tournament.generatedDraw, tournament.entrants) : [],
    [tournament],
  );
  const roundCount = tournament ? Math.log2(tournament.drawSize) : 0;
  const rounds = Array.from({ length: roundCount }, (_, index) => index + 1);
  const visibleRound = rounds.includes(activeRound) ? activeRound : 1;
  const visibleMatches = matches.filter((match) => match.round === visibleRound);

  useEffect(() => {
    if (!rounds.includes(activeRound) && rounds.length > 0) {
      setActiveRound(1);
    }
  }, [activeRound, roundCount]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  if (!tournament.generatedDraw) {
    return (
      <section className="empty-state">
        <h2>トーナメント表は未生成です。</h2>
        <button type="button" className="button primary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>オプション設定へ</button>
      </section>
    );
  }

  const readOnly = tournament.status === "completed";
  const selectionConfirmed = getTournamentMatchSelectionStatus(tournament) === "confirmed";
  const matchFormat = getTournamentMatchFormat(tournament);

  const saveResult = (matchId: string, result: TournamentMatchResult): void => {
    try {
      const current = matches.find((match) => match.id === matchId);
      if (!current) return;
      updateTournament({
        ...tournament,
        generatedDraw: updateTournamentMatch(tournament.generatedDraw!, matchId, {
          result,
          note: current.note,
          setScores: current.setScores,
        }, matchFormat),
      });
    } catch {
      // Result buttons are disabled for invalid states; stale concurrent data is ignored safely.
    }
  };

  const saveSetScore = (
    matchId: string,
    setIndex: number,
    participant: "participantA" | "participantB",
    value: number | null,
  ): void => {
    try {
      updateTournament({
        ...tournament,
        generatedDraw: updateTournamentMatchSetScore(
          tournament.generatedDraw!,
          matchId,
          matchFormat,
          setIndex,
          participant,
          value,
        ),
      });
    } catch {
      // A card that became unresolved between render and input cannot accept edits.
    }
  };

  const saveNote = (matchId: string, note: string): void => {
    try {
      const current = matches.find((match) => match.id === matchId);
      if (!current) return;
      updateTournament({
        ...tournament,
        generatedDraw: updateTournamentMatch(tournament.generatedDraw!, matchId, {
          result: current.result,
          note,
          setScores: current.setScores,
        }, matchFormat),
      });
    } catch {
      // A card that became unresolved between render and input cannot accept edits.
    }
  };

  const hasEnteredScores = tournament.generatedDraw.matches.some((match) =>
    match.setScores?.some((score) => score.participantA !== null || score.participantB !== null) ?? false,
  );

  const runRegenerate = (): void => {
    setShowIssues(true);
    const result = generateTournamentDraw(tournament, createRandomSeed(), integration);

    if (result.validation.errors.length > 0) {
      return;
    }

    setShowIssues(false);
    updateTournament(result.tournament);
  };

  const regenerateDisabled = selectionConfirmed || hasTournamentMatchData(tournament) || readOnly;
  const regenerateHelp = selectionConfirmed
    ? "対戦カード確定後は、1回戦の組合せを再生成できません。確定を解除してください。"
    : "結果、ゲーム数、または備考入力済みのため、1回戦の組合せを再生成できません。";

  const regenerate = (): void => {
    if (!regenerateDisabled) runRegenerate();
  };

  const confirmSelection = (): void => {
    updateTournament(markTournamentMatchSelectionConfirmed(tournament));
  };

  const unconfirmSelection = (): void => {
    updateTournament(unconfirmTournamentMatchSelection(tournament));
    setUnconfirmOpen(false);
  };

  const toggleDetailInput = (enabled: boolean): void => {
    if (!enabled && hasEnteredScores) {
      setDetailDisableOpen(true);
      return;
    }
    updateTournament(updateTournamentDetailInputEnabled(tournament, enabled));
  };

  const disableDetailInput = (): void => {
    updateTournament(updateTournamentDetailInputEnabled(tournament, false));
    setDetailDisableOpen(false);
  };

  return (
    <div className="page-stack tournament-matches-page">
      <section className="page-heading">
        <p className="page-description">ラウンドごとの対戦カードに対戦結果を入力します。結果は次のラウンドに自動で反映されます。</p>
      </section>

      <section className="section-card tournament-round-selector" aria-label="ラウンド選択">
        <div className="tournament-round-toolbar">
          <div className="group-tabs" role="tablist" aria-label="ラウンド">
            <span className="tab-label">ラウンド</span>
            <div className="group-tab-segment">
              {rounds.map((round) => (
                <button type="button" role="tab" aria-selected={round === visibleRound} className={round === visibleRound ? "tab active" : "tab"} key={round} onClick={() => setActiveRound(round)}>
                  {round === roundCount ? "決勝" : `第${round}回戦`}
                </button>
              ))}
            </div>
          </div>
          <div className="inline-actions no-print tournament-round-actions">
            <div className="disabled-action-tooltip" title={regenerateDisabled ? regenerateHelp : undefined} tabIndex={regenerateDisabled ? 0 : undefined} role={regenerateDisabled ? "group" : undefined} aria-label={regenerateDisabled ? regenerateHelp : undefined}>
              <button type="button" className="button secondary" title={regenerateDisabled ? regenerateHelp : "1回戦の組合せを再生成"} disabled={regenerateDisabled} onClick={regenerate}>1回戦の組合せを再生成</button>
            </div>
            <button type="button" className="button primary" onClick={selectionConfirmed ? () => {
              if (hasTournamentMatchData(tournament)) setUnconfirmOpen(true);
              else unconfirmSelection();
            } : confirmSelection} disabled={readOnly}>
              {selectionConfirmed ? "確定解除" : "対戦カードを確定"}
            </button>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-heading">
          <div className="section-card-title">
            <h2>対戦カード</h2>
            <span className={`status-badge ${selectionConfirmed ? "league-match-status-confirmed" : "league-match-status-pending"}`}>
              {selectionConfirmed ? "確定" : "未確定"}
            </span>
          </div>
          <label className="compact-checkbox no-print" title="ゲーム数を入力します。ONからOFFに変えると入力済みゲーム数がリセットされます。">
            <input type="checkbox" aria-label="詳細入力" checked={Boolean(tournament.detailInputEnabled)} disabled={!selectionConfirmed || readOnly} onChange={(event) => toggleDetailInput(event.target.checked)} />
            <span>詳細入力</span>
          </label>
        </div>
        {!readOnly ? <p className="field-hint tournament-match-state-message" role="status">{selectionConfirmed
          ? "各試合の勝敗・ゲーム数・備考を入力できます。ドロー構成や試合形式を変更する場合は、「確定解除」を押してください。"
          : "対戦カードの内容を確認し、「対戦カードを確定」を押してください。確定後に、勝敗・ゲーム数・備考を入力できます。"}</p> : null}
        {showIssues ? <ValidationBanner errors={validation.errors} warnings={validation.warnings} entrants={tournament.entrants} compact /> : null}
        <div className="league-match-cards">
          {visibleMatches.map((match) => (
            <TournamentMatchCard
              key={match.id}
              match={match}
              participantALabel={getParticipantLabel(match, "A", tournament.entrants, tournament.matchType)}
              participantBLabel={getParticipantLabel(match, "B", tournament.entrants, tournament.matchType)}
              matchFormat={matchFormat}
              detailInputEnabled={Boolean(tournament.detailInputEnabled)}
              disabled={!selectionConfirmed || readOnly}
              onResultChange={(result) => saveResult(match.id, result)}
              onSetScoreChange={(setIndex, participant, value) => saveSetScore(match.id, setIndex, participant, value)}
              onNoteChange={(note) => saveNote(match.id, note)}
            />
          ))}
        </div>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="オプション設定へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>戻る</button>
        <button type="button" className="button primary" title="トーナメント表へ進む" onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}>次へ</button>
      </div>

      <ConfirmDialog open={unconfirmOpen} title="対戦カードの確定を解除します" message="確定を解除すると、入力済みの勝敗、ゲーム数、備考がリセットされます。解除してもよろしいですか？" confirmLabel="解除して結果をリセット" cancelLabel="キャンセル" tone="warning" onConfirm={unconfirmSelection} onCancel={() => setUnconfirmOpen(false)} />
      <ConfirmDialog open={detailDisableOpen} title="詳細入力をOFFします" message="入力済みのゲーム数がリセットされますが、よろしいですか？" confirmLabel="OFFにする" cancelLabel="キャンセル" tone="warning" onConfirm={disableDetailInput} onCancel={() => setDetailDisableOpen(false)} />
    </div>
  );
}

function getParticipantLabel(
  match: ReturnType<typeof resolveTournamentMatches>[number],
  side: "A" | "B",
  entrants: readonly Entrant[],
  matchType: MatchType,
): string {
  const entrantId = side === "A" ? match.participantAId : match.participantBId;
  if (entrantId) {
    const entrant = entrants.find((item) => item.id === entrantId);
    if (!entrant) return "名称未設定";
    return matchType === "team"
      ? entrant.teamName || "名称未設定"
      : [entrant.player1Name, entrant.player2Name].filter(Boolean).join(" / ") || "名称未設定";
  }

  return match.state === "byeAdvance" ? "BYE" : "未確定";
}
