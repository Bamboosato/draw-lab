import { useEffect, useId, useMemo, useState } from "react";
import { calculateLeagueDrawSize, getLeagueRankUpperBound, resolveLeagueDrawSize } from "../app/leagueTournamentAdapter";
import { getRankOptions, getRankRangeValidationMessage, isValidRankRange, normalizeRankRange } from "../app/leagueTournamentPlacement";
import type { League } from "../domain/leagueTypes";
import type { RankRange } from "../domain/leagueTournamentTypes";
import { CompactSummary } from "./CompactSummary";

type LeagueTournamentCreateDialogProps = {
  open: boolean;
  leagues: readonly League[];
  onConfirm: (league: League, rankRange: RankRange) => void;
  onCancel: () => void;
};

export function LeagueTournamentCreateDialog({
  open,
  leagues,
  onConfirm,
  onCancel,
}: LeagueTournamentCreateDialogProps) {
  const titleId = useId();
  const confirmedLeagues = useMemo(
    () => leagues.filter((league) => league.matchSelectionStatus === "confirmed"),
    [leagues],
  );
  const [leagueId, setLeagueId] = useState("");
  const [minRank, setMinRank] = useState("1");
  const [maxRank, setMaxRank] = useState("2");

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setLeagueId("");
    setMinRank("1");
    setMaxRank("2");

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmedLeagues, onCancel, open]);

  if (!open) {
    return null;
  }

  const selectedLeague = confirmedLeagues.find((league) => league.id === leagueId);
  const rankUpperBound = selectedLeague ? getLeagueRankUpperBound(selectedLeague) : undefined;
  const minimumRank = Number.isInteger(Number(minRank)) && Number(minRank) >= 1 ? Number(minRank) : 1;
  const rankOptions = getRankOptions(rankUpperBound);
  const endRankOptions = getRankOptions(rankUpperBound, minimumRank);
  const rankRange = { min: Number(minRank), max: Number(maxRank) };
  const rankRangeValid = isValidRankRange(rankRange, rankUpperBound);
  const calculatedDrawSize = selectedLeague ? calculateLeagueDrawSize(selectedLeague.groups.length, rankRange) : undefined;
  const drawSize = selectedLeague ? resolveLeagueDrawSize(selectedLeague.groups.length, rankRange) : undefined;
  const canCreate = Boolean(selectedLeague && rankRangeValid && drawSize !== undefined);
  const feedbackMessage = selectedLeague && !rankRangeValid
    ? `${getRankRangeValidationMessage(rankRange, rankUpperBound)}。`
    : selectedLeague && rankRangeValid && drawSize === undefined
      ? `グループ数×順位数（${calculatedDrawSize ?? "-"}）は対応しているドローサイズではありません。`
      : selectedLeague && canCreate
        ? `作成時のドローサイズ: ${drawSize ?? `${calculatedDrawSize ?? "-"}（対応外）`}`
        : "";
  const feedbackIsError = Boolean(selectedLeague && !rankRangeValid)
    || Boolean(selectedLeague && rankRangeValid && drawSize === undefined);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="confirm-dialog league-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedLeague && canCreate) {
            onConfirm(selectedLeague, rankRange);
          }
        }}
      >
        <h2 id={titleId}>リーグ表から作成</h2>
        <p>引継ぎ元のリーグ表と、このトーナメントで扱う順位区分を指定してください。</p>

        <label className="field">
          <span>引継ぎ元のリーグ表</span>
          <select
            value={leagueId}
            onChange={(event) => {
              const nextLeagueId = event.target.value;
              setLeagueId(nextLeagueId);
              const nextLeague = confirmedLeagues.find((league) => league.id === nextLeagueId);
              if (!nextLeague) return;
              const nextRankRange = normalizeRankRange(
                { min: Number(minRank), max: Number(maxRank) },
                getLeagueRankUpperBound(nextLeague),
              );
              setMinRank(String(nextRankRange.min));
              setMaxRank(String(nextRankRange.max));
            }}
          >
            <option value="">リーグ表を選択してください</option>
            {confirmedLeagues.map((league) => (
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
            <span>順位区分（開始）</span>
            <select
              value={minRank}
              disabled={!selectedLeague}
              onChange={(event) => {
                const nextMinRank = event.target.value;
                setMinRank(nextMinRank);
                if (Number(maxRank) < Number(nextMinRank)) setMaxRank(nextMinRank);
              }}
            >
              {(rankOptions.length > 0 ? rankOptions : [Number(minRank) || 1]).map((rank) => <option key={rank} value={rank}>{rank}</option>)}
            </select>
          </label>
          <label className="field">
            <span>順位区分（終了）</span>
            <select value={maxRank} disabled={!selectedLeague} onChange={(event) => setMaxRank(event.target.value)}>
              {(endRankOptions.length > 0 ? endRankOptions : [Number(maxRank) || minimumRank]).map((rank) => <option key={rank} value={rank}>{rank}</option>)}
            </select>
          </label>
        </div>

        <p className="field-hint league-create-rank-limit-hint" aria-hidden="true">&nbsp;</p>

        {confirmedLeagues.length === 0 ? (
          <p className="field-hint" role="status">対戦カード確定済みのリーグ表がありません。</p>
        ) : null}

        <p
          className={`field-hint league-create-feedback-hint${feedbackIsError ? " error-text" : " league-create-draw-size-hint"}`}
          role={feedbackIsError ? "alert" : undefined}
        >
          {feedbackMessage || <span aria-hidden="true">&nbsp;</span>}
        </p>

        <div className="dialog-actions">
          <button type="button" className="button secondary" title="キャンセル" onClick={onCancel}>キャンセル</button>
          <button type="submit" className="button primary" title="基本情報へ進む" disabled={!canCreate}>基本情報へ進む</button>
        </div>
      </form>
    </div>
  );
}

function getLeagueStatusLabel(status: League["status"]): string {
  switch (status) {
    case "scheduled": return "対戦前";
    case "inProgress": return "進行中";
    case "completed": return "完了";
    case "draft": return "下書き";
  }
}
