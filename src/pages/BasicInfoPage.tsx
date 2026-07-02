import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DRAW_SIZES, SEED_COUNTS } from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import type { DrawSize, MatchType, Tournament } from "../domain/types";

export function BasicInfoPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const basicErrors = useMemo(() => tournament ? getBasicErrors(tournament) : [], [tournament]);

  if (!tournament) {
    return <NotFoundPanel />;
  }

  const update = (patch: Partial<Tournament>): void => {
    updateTournament({ ...tournament, ...patch, generatedDraw: undefined });
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Basic Information</p>
          <h2>大会の基本情報を入力</h2>
          <p>トーナメント表に表示する情報とドロー構成を設定します。</p>
        </div>
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
        <button type="button" className="button secondary" onClick={() => navigate("/")}>一覧へ戻る</button>
        <button type="button" className="button secondary" onClick={() => updateTournament(tournament)}>一時保存</button>
        <button
          type="button"
          className="button primary"
          disabled={basicErrors.length > 0}
          onClick={() => navigate(`/tournaments/${tournament.id}/edit/entrants`)}
        >
          次へ（名簿入力へ）
        </button>
      </div>
    </div>
  );
}

function getBasicErrors(tournament: Tournament): string[] {
  const errors: string[] = [];

  if (tournament.seedCount < 0) {
    errors.push("シード数は0以上にしてください。");
  }

  if (tournament.seedCount > tournament.drawSize) {
    errors.push("シード数はドローサイズ以下にしてください。");
  }

  return errors;
}

function NotFoundPanel() {
  return (
    <section className="empty-state">
      <h2>トーナメントが見つかりません。</h2>
    </section>
  );
}
