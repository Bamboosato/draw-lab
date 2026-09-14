import type { MatchFormat } from "../domain/matchScoring";
import type { ResolvedTournamentMatch, TournamentMatchResult } from "../domain/types";
import { MatchWinnerSelector } from "./MatchWinnerSelector";
import { SetScoreEditor } from "./SetScoreEditor";

export function TournamentMatchCard({
  match,
  participantALabel,
  participantBLabel,
  matchFormat,
  detailInputEnabled,
  disabled = false,
  onResultChange,
  onSetScoreChange,
  onWalkoverChange,
  onNoteChange,
}: {
  match: ResolvedTournamentMatch;
  participantALabel: string;
  participantBLabel: string;
  matchFormat: MatchFormat;
  detailInputEnabled: boolean;
  disabled?: boolean;
  onResultChange: (result: TournamentMatchResult) => void;
  onSetScoreChange: (setIndex: number, participant: "participantA" | "participantB", value: number | null) => void;
  onWalkoverChange: (walkover: boolean) => void;
  onNoteChange: (note: string) => void;
}) {
  const canEditMatch = !disabled && (match.state === "ready" || match.state === "completed");
  const status = getMatchStatus(match.state);
  const statusClass = match.state === "completed" ? "league-match-status-confirmed" : canEditMatch ? "generated" : "draft";

  return (
    <article className={`league-match-card tournament-match-card tournament-match-${match.state}`}>
      <div className="match-card-heading">
        <strong className="match-order-label">第{match.matchNo}試合</strong>
        <span className={`status-badge ${statusClass}`}>{status}</span>
      </div>
      <MatchWinnerSelector
        ariaLabel={`第${match.matchNo}試合の結果`}
        participantALabel={participantALabel}
        participantBLabel={participantBLabel}
        result={match.result}
        disabled={!canEditMatch}
        drawDisabled
        onResultChange={(result) => {
          if (result !== "draw") onResultChange(result);
        }}
      />
      {detailInputEnabled ? (
        <SetScoreEditor
          setScores={match.setScores}
          matchFormat={matchFormat}
          displayOrder={match.matchNo}
          readOnly={!canEditMatch}
          walkover={Boolean(match.isWalkover)}
          canMarkWalkover={match.result === "participantAWin" || match.result === "participantBWin"}
          onWalkoverChange={onWalkoverChange}
          onChange={onSetScoreChange}
        />
      ) : null}
      <label className="field">
        <span>備考</span>
        <input
          className="match-note-input"
          placeholder="試合に関する補足を入力してください（任意）"
          value={match.note ?? ""}
          disabled={!canEditMatch}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
    </article>
  );
}

function getMatchStatus(state: ResolvedTournamentMatch["state"]): string {
  switch (state) {
    case "ready":
      return "未実施";
    case "completed":
      return "実施済み";
    case "byeAdvance":
      return "BYE進出";
    case "pending":
      return "未確定";
  }
}
