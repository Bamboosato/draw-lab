import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createRandomSeed,
  generateTournamentDraw,
  getEntrantStats,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { ValidationBanner } from "../components/ValidationBanner";
import type { Tournament } from "../domain/types";

export function OptionsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const [validationVisible, setValidationVisible] = useState(false);

  const validation = useMemo(() => tournament ? validateTournamentForUi(tournament) : { errors: [], warnings: [] }, [tournament]);
  const stats = useMemo(() => tournament ? getEntrantStats(tournament) : undefined, [tournament]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const update = (patch: Partial<Tournament>): void => {
    updateTournament({ ...tournament, ...patch, generatedDraw: undefined });
  };

  const updateOptions = (patch: Partial<Tournament["options"]>): void => {
    update({ options: { ...tournament.options, ...patch } });
  };

  const generate = (): void => {
    setValidationVisible(true);

    if (validation.errors.length > 0) {
      return;
    }

    if (validation.warnings.length > 0 && !window.confirm("警告があります。内容を確認したうえで生成しますか？")) {
      return;
    }

    const seed = tournament.options.randomSeed || createRandomSeed();
    const result = generateTournamentDraw(tournament, seed);

    if (result.validation.errors.length > 0) {
      return;
    }

    updateTournament(result.tournament);
    navigate(`/tournaments/${tournament.id}/preview`);
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Generate Options</p>
          <h2>生成オプションの設定</h2>
          <p>配置条件と乱数シードを設定します。BYEをシード側へ優先配置する設定は初期ONです。</p>
        </div>
      </section>

      {validationVisible ? <ValidationBanner errors={validation.errors} warnings={validation.warnings} /> : null}

      <section className="option-layout">
        <div className="settings-panel">
          <h3>配置条件</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={tournament.options.avoidSameTeam}
              onChange={(event) => updateOptions({ avoidSameTeam: event.target.checked })}
            />
            <span>
              <strong>チーム偏り回避</strong>
              <small>同じ所属チームの初戦対戦や山の集中を抑制します。</small>
            </span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={tournament.options.avoidSameRegion}
              onChange={(event) => updateOptions({ avoidSameRegion: event.target.checked })}
            />
            <span>
              <strong>地区偏り回避</strong>
              <small>地区情報を使って初戦対戦と山の偏りを抑制します。</small>
            </span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={tournament.options.prioritizeSeedBye}
              onChange={(event) => updateOptions({ prioritizeSeedBye: event.target.checked })}
            />
            <span>
              <strong>BYEをシード側へ優先配置</strong>
              <small>上位シードの初戦相手側にBYEを優先します。</small>
            </span>
          </label>
        </div>

        <div className="settings-panel">
          <h3>乱数シード</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(tournament.options.randomSeed)}
              onChange={(event) => updateOptions({ randomSeed: event.target.checked ? createRandomSeed() : undefined })}
            />
            <span>
              <strong>シード値を固定する</strong>
              <small>同じ条件で同一の生成結果を再現できます。</small>
            </span>
          </label>
          <label className="field">
            <span>シード値</span>
            <div className="compound-input">
              <input
                value={tournament.options.randomSeed ?? ""}
                disabled={!tournament.options.randomSeed}
                onChange={(event) => updateOptions({ randomSeed: event.target.value })}
              />
              <button type="button" onClick={() => updateOptions({ randomSeed: createRandomSeed() })}>再生成</button>
            </div>
          </label>
        </div>

        <aside className="settings-panel">
          <h3>構成概要</h3>
          {stats ? (
            <dl className="summary-list">
              <div><dt>有効参加者数</dt><dd>{stats.activeEntrantCount}</dd></div>
              <div><dt>ドローサイズ</dt><dd>{tournament.drawSize}枠</dd></div>
              <div><dt>BYE数</dt><dd>{stats.byeCount === undefined ? "不正" : stats.byeCount}</dd></div>
              <div><dt>シード指定</dt><dd>{stats.seedAssignedCount}</dd></div>
            </dl>
          ) : null}
        </aside>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/entrants`)}>戻る（名簿入力へ）</button>
        <button type="button" className="button secondary" onClick={() => updateTournament(tournament)}>一時保存</button>
        <button type="button" className="button primary" onClick={generate}>トーナメント表を生成する</button>
      </div>
    </div>
  );
}
