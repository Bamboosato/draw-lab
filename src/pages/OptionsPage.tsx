import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  applyOptionsPatch,
  createRandomSeed,
  generateTournamentDraw,
  getEntrantStats,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { ValidationBanner } from "../components/ValidationBanner";
import type { DrawOptions } from "../domain/types";

export function OptionsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();

  const validation = useMemo(() => tournament ? validateTournamentForUi(tournament) : { errors: [], warnings: [] }, [tournament]);
  const stats = useMemo(() => tournament ? getEntrantStats(tournament) : undefined, [tournament]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const hasValidationErrors = validation.errors.length > 0;

  const updateOptions = (patch: Partial<DrawOptions>): void => {
    updateTournament(applyOptionsPatch(tournament, patch));
  };

  const proceedGenerate = (): void => {
    const seed = createRandomSeed();
    const result = generateTournamentDraw(tournament, seed);

    if (result.validation.errors.length > 0) {
      return;
    }

    updateTournament(result.tournament);
    navigate(`/tournaments/${tournament.id}/preview`);
  };

  const generate = (): void => {
    if (validation.errors.length > 0) {
      return;
    }

    proceedGenerate();
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="page-description">シード位置、BYE位置、残り選手の配置順序を設定します。</p>
      </section>

      {hasValidationErrors ? (
        <ValidationBanner errors={validation.errors} warnings={[]} entrants={tournament.entrants} />
      ) : null}

      <section className="option-layout">
        <div className="settings-panel">
          <h3>シード・BYE位置</h3>
          <div className="field-group">
            <span>第3・第4シード位置</span>
            <label className="check-field">
              <input
                type="radio"
                name="thirdFourthSeedPlacement"
                checked={(tournament.options.thirdFourthSeedPlacement ?? "tennisRule") === "tennisRule"}
                onChange={() => updateOptions({ thirdFourthSeedPlacement: "tennisRule" })}
              />
              <span><strong>テニス方式</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="thirdFourthSeedPlacement"
                checked={tournament.options.thirdFourthSeedPlacement === "standard"}
                onChange={() => updateOptions({ thirdFourthSeedPlacement: "standard" })}
              />
              <span><strong>標準方式</strong></span>
            </label>
          </div>
          <div className="field-group">
            <span>シード位置抽選</span>
            <label className="check-field">
              <input
                type="radio"
                name="seedPositionMode"
                checked={tournament.options.seedPositionMode === "fixed"}
                onChange={() => updateOptions({ seedPositionMode: "fixed" })}
              />
              <span><strong>抽選しない</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="seedPositionMode"
                checked={(tournament.options.seedPositionMode ?? "jtaRulebook") === "jtaRulebook"}
                onChange={() => updateOptions({ seedPositionMode: "jtaRulebook" })}
              />
              <span><strong>JTAルールブック方式</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="seedPositionMode"
                checked={tournament.options.seedPositionMode === "grandSlam"}
                onChange={() => updateOptions({ seedPositionMode: "grandSlam" })}
              />
              <span><strong>グランドスラム方式</strong></span>
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={tournament.options.fixByePositionOnSeedLottery ?? true}
              disabled={(tournament.options.seedPositionMode ?? "jtaRulebook") === "fixed"}
              onChange={(event) => updateOptions({ fixByePositionOnSeedLottery: event.target.checked })}
            />
            <span><strong>BYE位置を固定する</strong></span>
          </label>
        </div>

        <div className="settings-panel">
          <h3>選手配置順序</h3>
          <label className="check-field">
            <input
              type="radio"
              name="entrantPlacementOrder"
              checked={(tournament.options.entrantPlacementOrder ?? "largeTeamFirst") === "largeTeamFirst"}
              onChange={() => updateOptions({ entrantPlacementOrder: "largeTeamFirst" })}
            />
            <span><strong>メンバーの多いチームから配置</strong></span>
          </label>
          <label className="check-field">
            <input
              type="radio"
              name="entrantPlacementOrder"
              checked={tournament.options.entrantPlacementOrder === "random"}
              onChange={() => updateOptions({ entrantPlacementOrder: "random" })}
            />
            <span><strong>ランダムに配置</strong></span>
          </label>
          <label className="check-field">
            <input
              type="radio"
              name="entrantPlacementOrder"
              checked={tournament.options.entrantPlacementOrder === "rosterOrder"}
              onChange={() => updateOptions({ entrantPlacementOrder: "rosterOrder" })}
            />
            <span><strong>名簿記載順に配置</strong></span>
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
        <button type="button" className="button secondary" title="名簿入力へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/entrants`)}>戻る</button>
        <button
          type="button"
          className="button primary"
          title="プレビューへ進む"
          disabled={hasValidationErrors}
          onClick={generate}
        >
          {hasValidationErrors ? "エラー修正後に次へ" : "次へ"}
        </button>
      </div>
    </div>
  );
}
