import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { calculateLeagueDrawSize, createLeagueToTournament, formatLeagueTournamentTitle, getLeagueRankUpperBound, resolveLeagueDrawSize } from "../app/leagueTournamentAdapter";
import { getRankOptions, getRankRangeValidationMessage, isValidRankRange, normalizeRankRange } from "../app/leagueTournamentPlacement";
import { getBasicInfoErrors } from "../app/tournamentFlow";
import { applyBasicInfoPatch, applyEntrantsUpdate, DRAW_SIZES, ensureEntrantRows, SEED_COUNTS } from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { useLeagues } from "../app/LeagueProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { CompactSummary } from "../components/CompactSummary";
import type { DrawSize, MatchType, Tournament } from "../domain/types";

export function BasicInfoPage() {
  const navigate = useViewTransitionNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tournament = useTournament(id);
  const {
    updateTournament,
    updateTournamentWithIntegration,
    getTournamentIntegration,
  } = useTournaments();
  const { leagues } = useLeagues();
  const integration = tournament ? getTournamentIntegration(tournament.id) : undefined;
  const fromLeagueMode = searchParams.get("mode") === "from-league" || Boolean(integration);
  const [sourceLeagueId, setSourceLeagueId] = useState("");
  const [minRank, setMinRank] = useState("1");
  const [maxRank, setMaxRank] = useState("2");

  useEffect(() => {
    setSourceLeagueId(integration?.source.leagueId ?? "");
    setMinRank(String(integration?.rankRange.min ?? 1));
    setMaxRank(String(integration?.rankRange.max ?? 2));
  }, [integration?.rankRange.max, integration?.rankRange.min, integration?.source.leagueId, tournament?.id]);

  const selectedLeague = leagues.find((league) => league.id === (integration?.source.leagueId ?? sourceLeagueId));
  const rankUpperBound = selectedLeague ? getLeagueRankUpperBound(selectedLeague) : undefined;
  const minimumRank = Number.isInteger(Number(minRank)) && Number(minRank) >= 1 ? Number(minRank) : 1;
  const rankOptions = getRankOptions(rankUpperBound);
  const endRankOptions = getRankOptions(rankUpperBound, minimumRank);
  useEffect(() => {
    if (!tournament || !integration || integration.drawSizeMode !== undefined || !selectedLeague) return;
    if (!isValidRankRange(integration.rankRange, rankUpperBound)) return;

    const expectedDrawSize = resolveLeagueDrawSize(selectedLeague.groups.length, integration.rankRange);
    const autoTitle = formatLeagueTournamentTitle(selectedLeague.title, integration.rankRange);
    if (expectedDrawSize === undefined || tournament.drawSize === expectedDrawSize || tournament.title !== autoTitle) return;

    updateTournamentWithIntegration(
      { ...tournament, drawSize: expectedDrawSize, generatedDraw: undefined },
      { ...integration, drawSizeMode: "auto", updatedAt: new Date().toISOString() },
    );
  }, [integration, rankUpperBound, selectedLeague, tournament, updateTournamentWithIntegration]);

  const rankRange = { min: Number(minRank), max: Number(maxRank) };
  const basicErrors = useMemo(() => {
    if (!tournament) return [];
    const errors = [...getBasicInfoErrors(tournament)];
    if (fromLeagueMode) {
      if (!selectedLeague) {
        errors.push("引継ぎ元のリーグ表を選択してください。");
      }
      if (!isValidRankRange(rankRange, rankUpperBound)) {
        errors.push(`${getRankRangeValidationMessage(rankRange, rankUpperBound)}。`);
      }
    }
    return errors;
  }, [fromLeagueMode, rankRange.max, rankRange.min, rankUpperBound, selectedLeague, tournament]);

  if (!tournament) {
    return <NotFoundPanel />;
  }

  const rankRangeValid = isValidRankRange(rankRange, rankUpperBound);
  const calculatedLeagueDrawSize = selectedLeague
    ? calculateLeagueDrawSize(selectedLeague.groups.length, rankRange)
    : undefined;
  const resolvedLeagueDrawSize = selectedLeague
    ? resolveLeagueDrawSize(selectedLeague.groups.length, rankRange)
    : undefined;
  const leagueFeedbackMessage = selectedLeague && !rankRangeValid
    ? `${getRankRangeValidationMessage(rankRange, rankUpperBound)}。`
    : selectedLeague && rankRangeValid && resolvedLeagueDrawSize === undefined
      ? `グループ数×順位数（${calculatedLeagueDrawSize ?? "-"}）は対応しているドローサイズではありません。`
      : selectedLeague
        ? `現在のドローサイズ: ${tournament.drawSize}`
        : "";
  const leagueFeedbackIsError = Boolean(selectedLeague && !rankRangeValid)
    || Boolean(selectedLeague && rankRangeValid && resolvedLeagueDrawSize === undefined);

  const update = (patch: Partial<Tournament>): void => {
    const nextTournament = applyBasicInfoPatch(tournament, patch, integration);
    if (integration && patch.drawSize !== undefined) {
      updateTournamentWithIntegration(nextTournament, {
        ...integration,
        drawSizeMode: "manual",
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    updateTournament(nextTournament);
  };

  const selectSourceLeague = (leagueId: string): void => {
    setSourceLeagueId(leagueId);
    const league = leagues.find((item) => item.id === leagueId);
    if (!league) return;
    const nextRankRange = normalizeRankRange(rankRange, getLeagueRankUpperBound(league));
    setMinRank(String(nextRankRange.min));
    setMaxRank(String(nextRankRange.max));
    const result = createLeagueToTournament(tournament, league, nextRankRange);
    updateTournamentWithIntegration({
      ...result.tournament,
      title: tournament.title,
      date: tournament.date,
      venue: tournament.venue,
      eventName: tournament.eventName,
      drawSize: tournament.drawSize,
      options: tournament.options,
    }, {
      ...result.integration,
      drawSizeMode: integration ? "manual" : result.integration.drawSizeMode,
    });
  };

  const updateRankRange = (field: "min" | "max", value: string): void => {
    const nextMinRank = field === "min" ? Number(value) : Number(minRank);
    const nextMaxRank = field === "min" ? Math.max(Number(maxRank), Number(value)) : Number(value);
    if (field === "min") {
      setMinRank(value);
      if (Number(maxRank) < Number(value)) setMaxRank(value);
    } else setMaxRank(value);
    if (!integration) return;
    const nextRankRange = {
      min: nextMinRank,
      max: nextMaxRank,
    };
    if (!isValidRankRange(nextRankRange, rankUpperBound)) return;
    const currentAutoTitle = selectedLeague
      ? formatLeagueTournamentTitle(selectedLeague.title, integration.rankRange)
      : undefined;
    const nextTitle = currentAutoTitle && tournament.title === currentAutoTitle && selectedLeague
      ? formatLeagueTournamentTitle(selectedLeague.title, nextRankRange)
      : tournament.title;
    const sourceGroupCount = selectedLeague?.groups.length ?? integration.sourceGroupCount;
    const currentAutoDrawSize = resolveLeagueDrawSize(
      sourceGroupCount,
      integration.rankRange,
    );
    const nextAutoDrawSize = resolveLeagueDrawSize(
      sourceGroupCount,
      nextRankRange,
    );
    const legacyAutoDrawSize = integration.drawSizeMode === undefined
      && currentAutoTitle !== undefined
      && tournament.title === currentAutoTitle;
    const drawSizeIsAuto = integration.drawSizeMode !== "manual"
      && (integration.drawSizeMode === "auto"
        || (currentAutoDrawSize !== undefined && tournament.drawSize === currentAutoDrawSize)
        || legacyAutoDrawSize);
    const nextDrawSize = drawSizeIsAuto
      && nextAutoDrawSize !== undefined
      ? nextAutoDrawSize
      : tournament.drawSize;
    updateTournamentWithIntegration({ ...tournament, title: nextTitle, drawSize: nextDrawSize, generatedDraw: undefined }, {
      ...integration,
      rankRange: nextRankRange,
      drawSizeMode: integration.drawSizeMode ?? (drawSizeIsAuto ? "auto" : "manual"),
      updatedAt: new Date().toISOString(),
    });
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
          {renderRequiredLabel("種目区分")}
          <select
            value={tournament.matchType}
            onChange={(event) => update({ matchType: event.target.value as MatchType })}
          >
            <option value="singles">シングルス</option>
            <option value="doubles">ダブルス</option>
            <option value="team">チーム</option>
          </select>
        </label>
        <label className="field">
          {renderRequiredLabel("ドローサイズ")}
          <select
            value={tournament.drawSize}
            onChange={(event) => update({ drawSize: Number(event.target.value) as DrawSize })}
          >
            {DRAW_SIZES.map((size) => <option key={size} value={size}>{size}ドロー</option>)}
          </select>
        </label>
        <label className="field">
          {renderRequiredLabel("シード数")}
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

      {fromLeagueMode ? (
        <section className="settings-panel league-source-panel">
          <p className="field-hint">引継ぎ元のリーグ表と、このトーナメントで扱う順位区分を指定してください。</p>
          <label className="field">
            {renderRequiredLabel("引継ぎ元のリーグ表")}
            <select value={integration?.source.leagueId ?? sourceLeagueId} onChange={(event) => selectSourceLeague(event.target.value)}>
              <option value="">リーグ表を選択してください</option>
              {leagues.filter((league) => league.matchSelectionStatus === "confirmed").map((league) => (
                <option key={league.id} value={league.id}>{league.title || "無題のリーグ"}</option>
              ))}
            </select>
          </label>

          <CompactSummary
            ariaLabel="引継ぎ元リーグ表の概要"
            items={[
              { label: "リーグ表の状態", value: selectedLeague ? getLeagueStatusLabel(selectedLeague.status) : "" },
              { label: "定員", value: selectedLeague ? `${selectedLeague.capacity}名` : "" },
              { label: "グループ数", value: selectedLeague ? String(selectedLeague.groups.length) : "" },
              { label: "選択済み参加者数", value: selectedLeague ? `${selectedLeague.selection.selectedParticipantIds.length}名` : "" },
            ]}
          />

          <div className="form-grid league-create-rank-fields">
            <label className="field">
              {renderRequiredLabel("順位区分（開始）")}
              <select value={minRank} disabled={!selectedLeague} onChange={(event) => updateRankRange("min", event.target.value)}>
                {(rankOptions.length > 0 ? rankOptions : [Number(minRank) || 1]).map((rank) => <option key={rank} value={rank}>{rank}</option>)}
              </select>
            </label>
            <label className="field">
              {renderRequiredLabel("順位区分（終了）")}
              <select value={maxRank} disabled={!selectedLeague} onChange={(event) => updateRankRange("max", event.target.value)}>
                {(endRankOptions.length > 0 ? endRankOptions : [Number(maxRank) || minimumRank]).map((rank) => <option key={rank} value={rank}>{rank}</option>)}
              </select>
            </label>
          </div>

          <p className="field-hint league-create-rank-limit-hint" aria-hidden="true">&nbsp;</p>

          <p
            className={`field-hint league-create-feedback-hint${leagueFeedbackIsError ? " error-text" : " league-create-draw-size-hint"}`}
            role={leagueFeedbackIsError ? "alert" : undefined}
          >
            {leagueFeedbackMessage || <span aria-hidden="true">&nbsp;</span>}
          </p>

          {integration && selectedLeague?.updatedAt !== integration.source.leagueUpdatedAt ? (
            <p className="field-hint" role="status">引継ぎ元のリーグ表が更新されています。必要に応じて、リーグ表から作成し直してください。</p>
          ) : null}
        </section>
      ) : null}

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

function renderRequiredLabel(label: string) {
  return (
    <span className="required-header">
      {label}
      <span className="required-marker" aria-label="必須">*</span>
    </span>
  );
}

function NotFoundPanel() {
  return (
    <section className="empty-state">
      <h2>トーナメントが見つかりません。</h2>
    </section>
  );
}

function getLeagueStatusLabel(status: "draft" | "scheduled" | "inProgress" | "completed"): string {
  switch (status) {
    case "scheduled": return "対戦前";
    case "inProgress": return "進行中";
    case "completed": return "完了";
    case "draft": return "下書き";
  }
}
