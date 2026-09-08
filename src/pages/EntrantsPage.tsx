import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  applyEntrantsUpdate,
  compactTournament,
  createEmptyEntrant,
  getEntrantStats,
  hasTournamentMatchData,
  getTournamentMatchSelectionStatus,
  getVisibleEntrantRowCount,
  mergeEntrantsIntoEmptyRows,
  parseEntrantsFromText,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { syncTournamentIntegrationParticipants, updateTournamentIntegrationPlacement } from "../app/leagueTournamentAdapter";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { CompactSummary } from "../components/CompactSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ValidationBanner } from "../components/ValidationBanner";
import type { Entrant } from "../domain/types";
import type { TournamentIntegrationRecord } from "../domain/leagueTournamentTypes";

export function EntrantsPage() {
  const navigate = useViewTransitionNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const {
    updateTournament,
    updateTournamentWithIntegration,
    getTournamentIntegration,
    updateTournamentIntegration,
  } = useTournaments();
  const [pasteText, setPasteText] = useState("");
  const [checked, setChecked] = useState(false);
  const [warningConfirmOpen, setWarningConfirmOpen] = useState(false);
  const [manualVisibleRowCount, setManualVisibleRowCount] = useState(0);
  const [showRosterDetails, setShowRosterDetails] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingEntrants, setPendingEntrants] = useState<Entrant[]>();
  const [pendingIntegrationChange, setPendingIntegrationChange] = useState<TournamentIntegrationRecord>();

  useEffect(() => {
    setManualVisibleRowCount(0);
    setShowRosterDetails(false);
  }, [tournament?.id, tournament?.drawSize, tournament?.matchType]);

  const integration = tournament ? getTournamentIntegration(tournament.id) : undefined;
  const validation = useMemo(
    () => tournament ? validateTournamentForUi(tournament, integration) : { errors: [], warnings: [] },
    [integration, tournament],
  );
  const stats = useMemo(() => tournament ? getEntrantStats(tournament, integration) : undefined, [integration, tournament]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const rows = tournament.entrants;
  const isDoubles = tournament.matchType === "doubles";
  const isTeam = tournament.matchType === "team";
  const isLeagueLinked = Boolean(integration);
  const structureLocked = getTournamentMatchSelectionStatus(tournament) === "confirmed";
  const pastePlaceholder = isLeagueLinked
    ? isTeam
      ? "No, シード, リーググループ, リーグ順位, チーム名, メンバー（/区切り）, 所属チーム, 地区, ランキング"
      : isDoubles
      ? "No, シード, リーググループ, リーグ順位, 選手名1, 選手名2, 所属チーム1, 所属チーム2, 同チーム扱い, 地区, ランキング"
      : "No, シード, リーググループ, リーグ順位, 選手名, 所属チーム, 地区, ランキング"
    : isTeam
    ? "No, シード, チーム名, メンバー（/区切り）, 所属チーム, 地区, ランキング"
    : isDoubles
    ? "No, シード, 選手名1, 選手名2, 所属チーム1, 所属チーム2, 同チーム扱い, 地区, ランキング"
    : "No, シード, 選手名, 所属チーム, 地区, ランキング";
  const defaultVisibleRowCount = getVisibleEntrantRowCount(rows, tournament.drawSize);
  const visibleRowCount = Math.max(defaultVisibleRowCount, manualVisibleRowCount);
  const visibleRows = rows.slice(0, visibleRowCount);
  const hasValidationErrors = validation.errors.length > 0;
  const shouldBlockNext = checked && hasValidationErrors;
  const rosterDetailsToggle = (
    <button
      type="button"
      className="roster-details-toggle no-print"
      aria-controls="roster-details-columns"
      aria-expanded={showRosterDetails}
      aria-label={showRosterDetails ? "名簿の詳細列を閉じる" : "名簿の詳細列を開く"}
      title={showRosterDetails ? "詳細列を閉じる" : "詳細列を開く"}
      onClick={() => setShowRosterDetails((current) => !current)}
    >
      {showRosterDetails ? "⊖" : "⊕"}
    </button>
  );

  const saveEntrants = (next: ReturnType<typeof applyEntrantsUpdate>, nextIntegration = integration, entrants = next.entrants): void => {
    if (nextIntegration) {
      updateTournamentWithIntegration(next, syncTournamentIntegrationParticipants(nextIntegration, entrants));
      return;
    }
    updateTournament(next);
  };

  const updateEntrants = (entrants: Entrant[]): void => {
    const next = applyEntrantsUpdate(tournament, entrants, integration);
    if (hasTournamentMatchData(tournament) && next.generatedDraw?.id !== tournament.generatedDraw?.id) {
      setPendingEntrants(entrants);
      setResetConfirmOpen(true);
      return;
    }
    saveEntrants(next, integration, entrants);
  };

  const updateEntrant = (entrantId: string, patch: Partial<Entrant>): void => {
    updateEntrants(rows.map((entrant) => entrant.id === entrantId ? { ...entrant, ...patch } : entrant));
  };

  const updatePlacement = (entrantId: string, patch: Parameters<typeof updateTournamentIntegrationPlacement>[2]): void => {
    if (!integration) return;
    const nextIntegration = updateTournamentIntegrationPlacement(integration, entrantId, patch);
    if (hasTournamentMatchData(tournament)) {
      setPendingIntegrationChange(nextIntegration);
      setResetConfirmOpen(true);
      return;
    }
    updateTournamentIntegration(nextIntegration);
  };

  const addVisibleRow = (): void => {
    if (visibleRows.length < rows.length) {
      setManualVisibleRowCount(visibleRows.length + 1);
      return;
    }

    setManualVisibleRowCount(rows.length + 1);
    updateEntrants([...rows, createEmptyEntrant(rows.length + 1, tournament.matchType)]);
  };

  const proceedNext = (): void => {
    navigate(`/tournaments/${tournament.id}/edit/options`);
  };

  const goNext = (): void => {
    setChecked(true);

    if (validation.errors.length > 0) {
      return;
    }

    if (validation.warnings.length > 0) {
      setWarningConfirmOpen(true);
      return;
    }

    proceedNext();
  };

  return (
    <div className="page-stack entrants-page">
      <section className="page-heading">
        <p className="page-description">ExcelまたはスプレッドシートからのTSV/CSV貼り付けにも対応します。</p>
        <div className="button-row no-print">
          <button type="button" className="button secondary" title="名簿の入力行を追加" disabled={structureLocked} onClick={addVisibleRow}>行追加</button>
          <button type="button" className="button secondary" title="空の名簿行を削除" disabled={structureLocked} onClick={() => updateEntrants(compactTournament(tournament).entrants)}>空行削除</button>
          <button type="button" className="button secondary" title="名簿の入力内容をチェック" onClick={() => setChecked(true)}>入力チェック</button>
        </div>
      </section>

      {structureLocked ? <section className="flow-notice" role="status">対戦カード確定後のため、名簿は変更できません。</section> : null}

      {stats ? (
        <CompactSummary
          ariaLabel="名簿入力概要"
          items={[
            {
              label: "有効参加者数",
              value: String(stats.activeEntrantCount),
              tone: stats.hasEntrantOverflow ? "danger" : undefined,
              title: stats.hasEntrantOverflow
                ? `有効参加者数がドローサイズ（${tournament.drawSize}）を超えています`
                : undefined,
            },
            { label: "ドローサイズ", value: String(tournament.drawSize) },
            {
              label: "シード指定",
              value: String(stats.seedAssignedCount),
              tone: stats.seedAssignmentStatus === "matched" ? undefined : "danger",
              title: stats.seedAssignmentStatus === "shortage"
                ? `シード指定数が基本情報のシード数（${tournament.seedCount}）に対して不足しています`
                : stats.seedAssignmentStatus === "excess"
                  ? `シード指定数が基本情報のシード数（${tournament.seedCount}）を超えています`
                : undefined,
            },
            { label: "BYE数", value: stats.byeCount === undefined ? "—" : String(stats.byeCount) },
          ]}
          statusMessages={[
            ...(stats.hasEntrantOverflow ? ["有効参加者数がドローサイズを超過しています。"] : []),
            ...(stats.seedAssignmentStatus === "matched"
              ? []
              : [stats.seedAssignmentStatus === "shortage" ? "シード指定数が不足しています。" : "シード指定数が超過しています。"]),
          ]}
        />
      ) : null}

      {checked ? (
        <ValidationBanner errors={validation.errors} warnings={validation.warnings} entrants={rows} />
      ) : null}

      <fieldset disabled={structureLocked} className={`table-panel roster-panel${showRosterDetails ? " roster-details-open" : " roster-details-collapsed"}`}>
        <table id="roster-details-columns" className="data-table roster-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>シード</th>
              {isLeagueLinked ? <th colSpan={2} className="league-result-heading">リーグ結果</th> : null}
              <th className={isDoubles ? "roster-doubles-player-column" : undefined}>{renderRequiredHeader(isTeam ? "チーム名" : isDoubles ? "選手名1" : "選手名")}</th>
              {isTeam ? <th>メンバー（/区切り）</th> : isDoubles ? <th className="roster-doubles-player-column">{renderRequiredHeader("選手名2")}</th> : null}
              <th className={`roster-team-boundary-column${isDoubles ? " roster-doubles-team-column" : ""}`}>
                <span className="roster-team-heading">
                  {isDoubles ? "所属チーム1" : "所属チーム"}
                  {!isDoubles ? rosterDetailsToggle : null}
                </span>
              </th>
              {isDoubles ? (
                <th className="roster-team-boundary-column roster-doubles-team-column">
                  <span className="roster-team-heading">
                    所属チーム2
                    {rosterDetailsToggle}
                  </span>
                </th>
              ) : null}
              {isDoubles ? <th className="roster-detail-column same-team-group-column">同チーム扱い</th> : null}
              <th className="roster-detail-column roster-region-column">地区</th>
              <th className="roster-detail-column ranking-column">ランキング</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((entrant, index) => (
              <tr key={entrant.id}>
                <td className="row-number">{index + 1}</td>
                <td>
                  <input
                    className="short-input"
                    value={entrant.seedNo ?? ""}
                    onChange={(event) => updateEntrant(entrant.id, { seedNo: event.target.value })}
                  />
                </td>
                {isLeagueLinked ? (
                  <>
                    <td className="league-group-column">
                      <input
                        aria-label={`${index + 1} リーググループ`}
                        value={integration?.participants.find((participant) => participant.tournamentEntrantId === entrant.id)?.groupLabel
                          ?? integration?.participants.find((participant) => participant.tournamentEntrantId === entrant.id)?.groupKey
                          ?? ""}
                        onChange={(event) => updatePlacement(entrant.id, {
                          groupKey: event.target.value.trim() || undefined,
                          groupLabel: event.target.value.trim() || undefined,
                        })}
                      />
                    </td>
                    <td className="league-rank-column">
                      <input
                        aria-label={`${index + 1} リーグ順位`}
                        inputMode="numeric"
                        min={1}
                        value={integration?.participants.find((participant) => participant.tournamentEntrantId === entrant.id)?.rank ?? ""}
                        onChange={(event) => updatePlacement(entrant.id, {
                          rank: normalizeRankInput(event.target.value),
                          rankOrigin: "tournament-manual",
                        })}
                      />
                    </td>
                  </>
                ) : null}
                <td className={isDoubles ? "roster-doubles-player-column" : undefined}>
                  <input
                    aria-label={`${index + 1} ${isTeam ? "チーム名" : isDoubles ? "選手名1" : "選手名"}`}
                    value={isTeam ? entrant.teamName ?? "" : entrant.player1Name}
                    onChange={(event) => updateEntrant(entrant.id, isTeam
                      ? { teamName: event.target.value }
                      : { player1Name: event.target.value })}
                  />
                </td>
                {isTeam ? (
                  <td>
                    <input
                      aria-label={`${index + 1} メンバー`}
                      value={(entrant.memberNames ?? []).join("/")}
                      onChange={(event) => updateEntrant(entrant.id, {
                        memberNames: event.target.value.split("/").map((memberName) => memberName.trim()).filter(Boolean),
                      })}
                    />
                  </td>
                ) : isDoubles ? (
                  <td className="roster-doubles-player-column">
                    <input
                      value={entrant.player2Name ?? ""}
                      onChange={(event) => updateEntrant(entrant.id, { player2Name: event.target.value })}
                    />
                  </td>
                ) : null}
                <td className={isDoubles ? "roster-doubles-team-column" : undefined}>
                  <input value={entrant.team1 ?? ""} onChange={(event) => updateEntrant(entrant.id, { team1: event.target.value })} />
                </td>
                {isDoubles ? (
                  <td className="roster-doubles-team-column">
                    <input value={entrant.team2 ?? ""} onChange={(event) => updateEntrant(entrant.id, { team2: event.target.value })} />
                  </td>
                ) : null}
                {isDoubles ? (
                  <td className="roster-detail-column same-team-group-column">
                    <input
                      maxLength={5}
                      value={entrant.sameTeamGroup ?? ""}
                      onChange={(event) => updateEntrant(entrant.id, { sameTeamGroup: event.target.value })}
                    />
                  </td>
                ) : null}
                <td className="roster-detail-column roster-region-column">
                  <input value={entrant.region ?? ""} onChange={(event) => updateEntrant(entrant.id, { region: event.target.value })} />
                </td>
                <td className="roster-detail-column ranking-column">
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]*"
                    value={entrant.ranking ?? ""}
                    onChange={(event) => updateEntrant(entrant.id, { ranking: normalizeRankingInput(event.target.value) })}
                  />
                </td>
                <td>
                  <button type="button" className="danger-link" title="この参加者を削除" onClick={() => updateEntrants(rows.filter((item) => item.id !== entrant.id))}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <section className="paste-panel no-print">
        <label className="field">
          <span>TSV/CSV貼り付け</span>
          <textarea
            value={pasteText}
            disabled={structureLocked}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={pastePlaceholder}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            title="貼り付けたTSV/CSVを名簿に取り込む"
            disabled={structureLocked}
            onClick={() => {
              const parsed = parseEntrantsFromText(pasteText, tournament.matchType);
              updateEntrants(mergeEntrantsIntoEmptyRows(rows, parsed));
              setPasteText("");
              setChecked(true);
            }}
          >
            貼り付けを取り込み
          </button>
        </div>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="トーナメント一覧へ戻る" onClick={() => navigate("/tournaments")}>一覧</button>
        <button type="button" className="button secondary" title="基本情報へ戻る" onClick={() => navigate(`/tournaments/${tournament.id}/edit/basic`)}>戻る</button>
        <button
          type="button"
          className="button primary"
          title="オプション設定へ進む"
          disabled={shouldBlockNext}
          onClick={goNext}
        >
          {shouldBlockNext ? "エラー修正後に次へ" : "次へ"}
        </button>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="結果と備考をリセットします"
        message="名簿を変更すると、トーナメントの再生成により入力済みの勝敗と備考がリセットされます。続行してもよろしいですか？"
        confirmLabel="リセットして続行"
        cancelLabel="キャンセル"
        onCancel={() => {
          setResetConfirmOpen(false);
          setPendingEntrants(undefined);
          setPendingIntegrationChange(undefined);
        }}
        onConfirm={() => {
          const integrationToSave = pendingIntegrationChange;
          if (integrationToSave) {
            setResetConfirmOpen(false);
            setPendingEntrants(undefined);
            setPendingIntegrationChange(undefined);
            updateTournamentIntegration(integrationToSave);
            return;
          }
          const entrantsToSave = pendingEntrants;
          setResetConfirmOpen(false);
          setPendingEntrants(undefined);
          setPendingIntegrationChange(undefined);
          if (!entrantsToSave) return;
          const next = applyEntrantsUpdate(tournament, entrantsToSave, integration);
          saveEntrants(next, integration, entrantsToSave);
        }}
      />
      <ConfirmDialog
        open={warningConfirmOpen}
        title="警告があります"
        message="内容を確認したうえで次へ進みますか？"
        confirmLabel="確認して次へ"
        cancelLabel="戻って修正"
        onCancel={() => setWarningConfirmOpen(false)}
        onConfirm={() => {
          setWarningConfirmOpen(false);
          proceedNext();
        }}
      />
    </div>
  );
}

function renderRequiredHeader(label: string) {
  return (
    <span className="required-header">
      {label}
      <span className="required-marker" aria-label="必須">*</span>
    </span>
  );
}

function normalizeRankingInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function normalizeRankInput(value: string): number | undefined {
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  const rank = Number(digits);
  return Number.isInteger(rank) && rank >= 1 ? rank : undefined;
}
