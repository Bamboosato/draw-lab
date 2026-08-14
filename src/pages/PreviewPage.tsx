import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createRandomSeed, generateTournamentDraw, validateTournamentForUi } from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { DrawPreview } from "../components/DrawPreview";
import { ValidationBanner } from "../components/ValidationBanner";
import { buildBracketViewModel } from "../domain/bracketViewModel";

export function PreviewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const [showIssues, setShowIssues] = useState(false);
  const validation = useMemo(() => tournament ? validateTournamentForUi(tournament) : { errors: [], warnings: [] }, [tournament]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const regenerate = (): void => {
    setShowIssues(true);
    const result = generateTournamentDraw(tournament, createRandomSeed());

    if (result.validation.errors.length > 0) {
      return;
    }

    updateTournament(result.tournament);
  };

  const viewModel = tournament.generatedDraw
    ? buildBracketViewModel(tournament, tournament.generatedDraw)
    : undefined;

  return (
    <div className="page-stack preview-page">
      <section className="page-heading no-print">
        <p className="page-description">生成済みトーナメント表を確認し、ブラウザ印刷を実行します。</p>
        <div className="button-row">
          <button type="button" className="button secondary" title="トーナメント表を再生成" onClick={regenerate}>再生成</button>
          <button type="button" className="button primary" title="トーナメント表をPDF保存または印刷" onClick={() => window.print()}>PDF / 印刷</button>
        </div>
      </section>

      {showIssues ? (
        <ValidationBanner
          errors={validation.errors}
          warnings={validation.warnings}
          entrants={tournament.entrants}
          compact
        />
      ) : null}

      {viewModel && tournament.generatedDraw ? (
        <DrawPreview
          viewModel={viewModel}
          generatedAt={tournament.generatedDraw.generatedAt}
        />
      ) : (
        <section className="empty-state">
          <h2>トーナメント表は未生成です。</h2>
          <p>トーナメント生成画面でトーナメント表を生成してください。</p>
          <button type="button" className="button primary" title="トーナメント生成画面へ進む" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>トーナメント生成へ</button>
        </section>
      )}

      <div className="bottom-actions preview-footer-actions no-print">
        <button type="button" className="button secondary" title="トーナメント生成へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>戻る</button>
        <button type="button" className="button primary" title="トーナメント一覧へ戻る" onClick={() => navigate("/")}>一覧</button>
      </div>
    </div>
  );
}
