import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBasicInfoErrors } from "../app/tournamentFlow";
import { applyBasicInfoPatch, applyEntrantsUpdate, DRAW_SIZES, ensureEntrantRows, SEED_COUNTS } from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import type { DrawSize, MatchType, Tournament } from "../domain/types";

export function BasicInfoPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const basicErrors = useMemo(() => tournament ? getBasicInfoErrors(tournament) : [], [tournament]);

  if (!tournament) {
    return <NotFoundPanel />;
  }

  const update = (patch: Partial<Tournament>): void => {
    updateTournament(applyBasicInfoPatch(tournament, patch));
  };

  const goNext = (): void => {
    const entrants = ensureEntrantRows(tournament.entrants, tournament.drawSize, tournament.matchType);

    updateTournament(applyEntrantsUpdate(tournament, entrants));
    navigate(`/tournaments/${tournament.id}/edit/entrants`);
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="page-description">トーナメント表に表示する情報とドロー構成を設定します。</p>
      </section>

      {basicErrors.length > 0 ? (
        <section className="validation-banner error">
          <strong>入力内容に不備があります。</strong>
          <ul>
            {basicErrors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="form-grid">
        <label className="field">
          <span>大会名</span>
          <input value={tournament.title ?? ""} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label className="field">
          <span>開催日</span>
          <input type="date" value={tournament.date ?? ""} onChange={(event) => update({ date: event.target.value })} />
        </label>
        <label className="field">
          <span>会場</span>
          <input value={tournament.venue ?? ""} onChange={(event) => update({ venue: event.target.value })} />
        </label>
        <label className="field">
          <span>種目名</span>
          <input value={tournament.eventName ?? ""} onChange={(event) => update({ eventName: event.target.value })} />
        </label>
        <label className="field">
          <span>種目区分</span>
          <select
            value={tournament.matchType}
            onChange={(event) => update({ matchType: event.target.value as MatchType })}
          >
            <option value="singles">シングルス</option>
            <option value="doubles">ダブルス</option>
          </select>
        </label>
        <label className="field">
          <span>ドローサイズ</span>
          <select
            value={tournament.drawSize}
            onChange={(event) => update({ drawSize: Number(event.target.value) as DrawSize })}
          >
            {DRAW_SIZES.map((size) => <option key={size} value={size}>{size}ドロー</option>)}
          </select>
        </label>
        <label className="field">
          <span>シード数</span>
          <select
            value={tournament.seedCount}
            onChange={(event) => update({ seedCount: Number(event.target.value) })}
          >
            {SEED_COUNTS.filter((count) => count <= tournament.drawSize).map((count) => (
              <option key={count} value={count}>{count === 0 ? "シードなし" : `${count}シード`}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="トーナメント一覧へ戻る" onClick={() => navigate("/")}>一覧</button>
        <button
          type="button"
          className="button primary"
          title="名簿入力へ進む"
          disabled={basicErrors.length > 0}
          onClick={goNext}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <section className="empty-state">
      <h2>トーナメントが見つかりません。</h2>
    </section>
  );
}
