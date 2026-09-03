import type { ResolvedTournamentMatch, TournamentMatchResult } from "../domain/types";
import { MatchWinnerSelector } from "./MatchWinnerSelector";

export function TournamentMatchCard({
  match,
  participantALabel,
  participantBLabel,
  onResultChange,
  onNoteChange,
}: {
  match: ResolvedTournamentMatch;
  participantALabel: string;
  participantBLabel: string;
  onResultChange: (result: TournamentMatchResult) => void;
  onNoteChange: (note: string) => void;
}) {
  const canEditResult = match.state === "ready" || match.state === "completed";
  const status = getMatchStatus(match.state);
  const statusClass = match.state === "completed" ? "league-match-status-confirmed" : canEditResult ? "generated" : "draft";

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
        disabled={!canEditResult}
        drawDisabled
        onResultChange={(result) => {
          if (result !== "draw") onResultChange(result);
        }}
      />
      <label className="field">
        <span>備考</span>
        <input
          className="match-note-input"
          placeholder="結果の詳細を記録してください（任意）"
          value={match.note ?? ""}
          disabled={!canEditResult}
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
      return "実施済";
    case "byeAdvance":
      return "BYE進出";
    case "pending":
      return "未確定";
  }
}
