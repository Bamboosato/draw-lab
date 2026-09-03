import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { resolveTournamentMatches, updateTournamentMatch } from "../domain/tournamentMatches";
import type { Entrant, MatchType, TournamentMatchResult } from "../domain/types";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { TournamentMatchCard } from "../components/TournamentMatchCard";

export function TournamentMatchesPage() {
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const navigate = useViewTransitionNavigate();
  const [activeRound, setActiveRound] = useState(1);

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

  const saveResult = (matchId: string, result: TournamentMatchResult): void => {
    try {
      updateTournament({
        ...tournament,
        generatedDraw: updateTournamentMatch(tournament.generatedDraw!, matchId, {
          result,
          note: matches.find((match) => match.id === matchId)?.note,
        }),
      });
    } catch {
      // Result buttons are disabled for invalid states; stale concurrent data is ignored safely.
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
        }),
      });
    } catch {
      // A card that became unresolved between render and input cannot accept edits.
    }
  };

  return (
    <div className="page-stack tournament-matches-page">
      <section className="page-heading">
        <p className="page-description">ラウンドごとの対戦カードに対戦結果を入力します。結果は次のラウンドに自動で反映されます。</p>
      </section>

      <section className="section-card tournament-round-selector" aria-label="ラウンド選択">
        <div className="group-tabs" role="tablist" aria-label="ラウンド">
          <span className="tab-label">ラウンド</span>
          <div className="group-tab-segment">
            {rounds.map((round) => (
              <button
                type="button"
                role="tab"
                aria-selected={round === visibleRound}
                className={round === visibleRound ? "tab active" : "tab"}
                key={round}
                onClick={() => setActiveRound(round)}
              >
                {round === roundCount ? "決勝" : `第${round}回戦`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-heading">
          <div>
            <h2>対戦カード</h2>
            <p>結果入力はこの一覧から行います。</p>
          </div>
        </div>
        <div className="league-match-cards">
          {visibleMatches.map((match) => (
            <TournamentMatchCard
              key={match.id}
              match={match}
              participantALabel={getParticipantLabel(match, "A", tournament.entrants, tournament.matchType)}
              participantBLabel={getParticipantLabel(match, "B", tournament.entrants, tournament.matchType)}
              onResultChange={(result) => saveResult(match.id, result)}
              onNoteChange={(note) => saveNote(match.id, note)}
            />
          ))}
        </div>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="オプション設定へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>戻る</button>
        <button type="button" className="button primary" title="生成・プレビューへ進む" onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}>次へ</button>
      </div>
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
