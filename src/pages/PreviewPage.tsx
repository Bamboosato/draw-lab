import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createRandomSeed, generateTournamentDraw, validateTournamentForUi } from "../app/tournamentModel";
import { downloadTournament } from "../app/tournamentPersistence";
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

  const regenerate = (seed: string): void => {
    setShowIssues(true);
    const result = generateTournamentDraw(tournament, seed);

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
        <div>
          <p className="eyebrow">Preview</p>
          <h2>プレビュー</h2>
          <p>生成済みトーナメント表を確認し、JSON出力またはブラウザ印刷を実行します。</p>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => regenerate(tournament.generatedDraw?.randomSeed ?? createRandomSeed())}>同じseedで再生成</button>
          <button type="button" className="button secondary" onClick={() => regenerate(createRandomSeed())}>新しいseedで再生成</button>
          <button type="button" className="button secondary" onClick={() => downloadTournament(tournament)}>JSON出力</button>
          <button type="button" className="button primary" onClick={() => window.print()}>PDF / 印刷</button>
        </div>
      </section>

      {showIssues ? <ValidationBanner errors={validation.errors} warnings={validation.warnings} compact /> : null}

      {viewModel && tournament.generatedDraw ? (
        <DrawPreview
          viewModel={viewModel}
          randomSeed={tournament.generatedDraw.randomSeed}
          generatedAt={tournament.generatedDraw.generatedAt}
        />
      ) : (
        <section className="empty-state">
          <h2>トーナメント表は未生成です。</h2>
          <p>生成オプション画面でトーナメント表を生成してください。</p>
          <button type="button" className="button primary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>生成オプションへ</button>
        </section>
      )}

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/basic`)}>基本情報へ戻る</button>
        <button type="button" className="button secondary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/entrants`)}>名簿へ戻る</button>
        <button type="button" className="button secondary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>オプションへ戻る</button>
        <button type="button" className="button primary" onClick={() => navigate("/")}>保存して一覧へ</button>
      </div>
    </div>
  );
}
