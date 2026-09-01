import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createRandomSeed,
  generateTournamentDraw,
  isTournamentDrawCurrent,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { DrawPreview } from "../components/DrawPreview";
import { ValidationBanner } from "../components/ValidationBanner";
import { buildBracketViewModel } from "../domain/bracketViewModel";
import { buildTournamentPrintFilename, printWithFilename } from "../utils/print";

export function PreviewPage() {
  const navigate = useViewTransitionNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament, getTournamentIntegration } = useTournaments();
  const [showIssues, setShowIssues] = useState(false);
  const integration = tournament ? getTournamentIntegration(tournament.id) : undefined;
  const validation = useMemo(
    () => tournament ? validateTournamentForUi(tournament, integration) : { errors: [], warnings: [] },
    [integration, tournament],
  );

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const drawCurrent = isTournamentDrawCurrent(tournament, integration);

  const regenerate = (): void => {
    setShowIssues(true);
    const result = generateTournamentDraw(tournament, createRandomSeed(), integration);

    if (result.validation.errors.length > 0) {
      return;
    }

    updateTournament(result.tournament);
  };

  const viewModel = drawCurrent && tournament.generatedDraw
    ? buildBracketViewModel(tournament, tournament.generatedDraw)
    : undefined;

  return (
    <div className="page-stack preview-page">
      <section className="page-heading no-print">
        <p className="page-description">生成済みトーナメント表を確認し、ブラウザ印刷を実行します。</p>
        <div className="button-row">
          <button type="button" className="button secondary" title="トーナメント表を再生成" onClick={regenerate}>再生成</button>
          <button type="button" className="button primary" title="トーナメント表をPDF保存または印刷" disabled={!drawCurrent} onClick={() => printWithFilename(buildTournamentPrintFilename(tournament.title))}>PDF / 印刷</button>
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
          <p>{tournament.generatedDraw || tournament.options.randomSeed
            ? "入力内容のエラーを修正すると、トーナメント表は自動生成されます。"
            : "オプション設定画面で設定を確認し、トーナメント表を初回生成してください。"}</p>
          <button type="button" className="button primary" title="オプション設定画面へ進む" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>オプション設定へ</button>
        </section>
      )}

      <div className="bottom-actions preview-footer-actions no-print">
        <button type="button" className="button secondary" title="オプション設定へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/options`)}>戻る</button>
        <button type="button" className="button primary" title="トーナメント一覧へ戻る" onClick={() => navigate("/")}>一覧</button>
      </div>
    </div>
  );
}
