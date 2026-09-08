import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  completeTournament,
  getTournamentCompletionErrors,
  isTournamentDrawCurrent,
  reopenTournament,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DrawPreview } from "../components/DrawPreview";
import { ValidationBanner } from "../components/ValidationBanner";
import { buildBracketViewModel } from "../domain/bracketViewModel";
import { buildTournamentPrintFilename, printWithFilename } from "../utils/print";

export function PreviewPage() {
  const navigate = useViewTransitionNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { getTournamentIntegration, updateTournament } = useTournaments();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [completionAttempted, setCompletionAttempted] = useState(false);
  const integration = tournament ? getTournamentIntegration(tournament.id) : undefined;

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const drawCurrent = isTournamentDrawCurrent(tournament, integration);
  const readOnly = tournament.status === "completed";
  const completionErrors = getTournamentCompletionErrors(tournament);

  const viewModel = drawCurrent && tournament.generatedDraw
    ? buildBracketViewModel(tournament, tournament.generatedDraw)
    : undefined;

  const handleComplete = () => {
    if (completionErrors.length > 0) {
      setCompletionAttempted(true);
      return;
    }
    updateTournament(completeTournament(tournament));
  };

  return (
    <div className="page-stack preview-page">
      <section className="page-heading no-print">
        <p className="page-description">生成済みトーナメント表を確認し、ブラウザ印刷を実行します。</p>
        <div className="button-row">
          {readOnly ? (
            <button type="button" className="button primary" title="トーナメントを編集できる状態に戻す" onClick={() => setReopenOpen(true)}>編集を再開</button>
          ) : (
            <button type="button" className="button primary" title="生成済みトーナメント表を完了する" onClick={handleComplete}>トーナメントを完了</button>
          )}
          <button type="button" className="button secondary" title="トーナメント表をPDF保存または印刷" disabled={!drawCurrent} onClick={() => printWithFilename(buildTournamentPrintFilename(tournament.title))}>PDF/印刷</button>
        </div>
      </section>

      {readOnly ? <section className="flow-notice no-print" role="status">このトーナメントは完了済みです。内容は読み取り専用です。</section> : null}
      {!readOnly && completionAttempted && completionErrors.length > 0 ? <ValidationBanner errors={completionErrors} warnings={[]} compact /> : null}

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
        <button type="button" className="button secondary" disabled={readOnly} title={readOnly ? "完了済みトーナメントは対戦カードへ戻れません" : "対戦カードへ戻る"} onClick={() => navigate(`/tournaments/${tournament.id}/edit/matches`)}>戻る</button>
        <button type="button" className="button primary" title="トーナメント一覧へ戻る" onClick={() => navigate("/tournaments")}>一覧</button>
      </div>
      <ConfirmDialog
        open={reopenOpen}
        title="完了済みトーナメントの編集を再開します"
        message="トーナメントを編集中に戻します。結果、ゲーム数、備考、組合せは保持されます。"
        confirmLabel="編集を再開"
        cancelLabel="キャンセル"
        onCancel={() => setReopenOpen(false)}
        onConfirm={() => {
          updateTournament(reopenTournament(tournament));
          setReopenOpen(false);
        }}
      />
    </div>
  );
}
