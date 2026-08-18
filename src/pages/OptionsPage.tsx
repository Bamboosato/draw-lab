import { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  applyOptionsPatch,
  applyOutputOptionsPatch,
  createRandomSeed,
  generateTournamentDraw,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { ValidationBanner } from "../components/ValidationBanner";
import {
  getAvailableOutputPageCounts,
  getDrawOutputOptions,
  getEffectiveOutputPageCount,
} from "../domain/outputOptions";
import type { DrawOptions, DrawOutputOptions } from "../domain/types";

export function OptionsPage() {
  const navigate = useViewTransitionNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();

  const validation = useMemo(() => tournament ? validateTournamentForUi(tournament) : { errors: [], warnings: [] }, [tournament]);
  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const hasValidationErrors = validation.errors.length > 0;

  const updateOptions = (patch: Partial<DrawOptions>): void => {
    updateTournament(applyOptionsPatch(tournament, patch));
  };

  const outputOptions = getDrawOutputOptions(tournament.outputOptions);
  const outputPageCounts = getAvailableOutputPageCounts(tournament.drawSize);
  const outputPageCount = getEffectiveOutputPageCount(
    outputOptions.outputPageCount,
    tournament.drawSize,
    outputOptions.bracketLayout,
  );

  const updateOutputOptions = (patch: Partial<DrawOutputOptions>): void => {
    updateTournament(applyOutputOptionsPatch(tournament, patch));
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
        <p className="page-description">シード位置、BYE位置、選手配置順序、出力形式を設定します。</p>
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

        <aside className="settings-panel output-options-panel">
          <h3>出力形式</h3>
          <div className="field-group">
            <span>トーナメント出力形式</span>
            <label className="check-field">
              <input
                type="radio"
                name="bracketLayout"
                checked={outputOptions.bracketLayout === "singleSide"}
                onChange={() => updateOutputOptions({ bracketLayout: "singleSide" })}
              />
              <span><strong>片山</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="bracketLayout"
                checked={outputOptions.bracketLayout === "bothSides"}
                onChange={() => updateOutputOptions({ bracketLayout: "bothSides" })}
              />
              <span><strong>両山</strong></span>
            </label>
          </div>
          <label className="select-field">
            <span>出力ページ数</span>
            <select
              value={outputPageCount}
              disabled={outputOptions.bracketLayout === "singleSide"}
              onChange={(event) => updateOutputOptions({
                outputPageCount: Number(event.target.value) as DrawOutputOptions["outputPageCount"],
              })}
            >
              {outputPageCounts.map((pageCount) => (
                <option key={pageCount} value={pageCount}>{pageCount}ページ</option>
              ))}
            </select>
          </label>
          <div className="field-group">
            <span>右山のドロー番号位置</span>
            <label className="check-field">
              <input
                type="radio"
                name="rightSideDrawNumberPosition"
                checked={outputOptions.rightSideDrawNumberPosition === "left"}
                disabled={outputOptions.bracketLayout === "singleSide"}
                onChange={() => updateOutputOptions({ rightSideDrawNumberPosition: "left" })}
              />
              <span><strong>左</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="rightSideDrawNumberPosition"
                checked={outputOptions.rightSideDrawNumberPosition === "right"}
                disabled={outputOptions.bracketLayout === "singleSide"}
                onChange={() => updateOutputOptions({ rightSideDrawNumberPosition: "right" })}
              />
              <span><strong>右</strong></span>
            </label>
          </div>
          <div className="field-group">
            <span>シード番号位置</span>
            <label className="check-field">
              <input
                type="radio"
                name="seedNumberPosition"
                checked={outputOptions.seedNumberPosition === "outer"}
                onChange={() => updateOutputOptions({ seedNumberPosition: "outer" })}
              />
              <span><strong>外側</strong></span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="seedNumberPosition"
                checked={outputOptions.seedNumberPosition === "inner"}
                onChange={() => updateOutputOptions({ seedNumberPosition: "inner" })}
              />
              <span><strong>内側</strong></span>
            </label>
          </div>
          <label className="select-field">
            <span>ドロー線の太さ</span>
            <select
              value={outputOptions.lineWeight}
              onChange={(event) => updateOutputOptions({ lineWeight: event.target.value as DrawOutputOptions["lineWeight"] })}
            >
              <option value="thin">細線</option>
              <option value="normal">標準線</option>
              <option value="bold">太線</option>
              <option value="extraBold">極太線</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={outputOptions.teamNameBrackets}
              onChange={(event) => updateOutputOptions({ teamNameBrackets: event.target.checked })}
            />
            <span><strong>チーム名をカッコ付きで表示</strong></span>
          </label>
          <div className="field-group">
            <span>文字位置</span>
            {([
              ["default", "標準"],
              ["center", "中央"],
              ["distributed", "均等割付"],
            ] as const).map(([value, label]) => (
              <label className="check-field" key={value}>
                <input
                  type="radio"
                  name="textAlign"
                  checked={outputOptions.textAlign === value}
                  onChange={() => updateOutputOptions({ textAlign: value })}
                />
                <span><strong>{label}</strong></span>
              </label>
            ))}
          </div>
        </aside>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="トーナメント一覧へ戻る" onClick={() => navigate("/")}>一覧</button>
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
