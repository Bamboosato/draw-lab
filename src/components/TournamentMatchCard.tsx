import type { ResolvedTournamentMatch, TournamentMatchResult } from "../domain/types";

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
        <strong>第{match.matchNo}試合</strong>
        <span className={`status-badge ${statusClass}`}>{status}</span>
      </div>
      <div className="match-pair match-card-players">
        <span>{participantALabel}</span>
        <span className="match-vs">vs</span>
        <span>{participantBLabel}</span>
      </div>
      <div className="result-toggle" role="group" aria-label={`第${match.matchNo}試合の結果`}>
        <ResultButton
          label="未実施"
          active={match.result === "unplayed"}
          disabled={!canEditResult}
          onClick={() => onResultChange("unplayed")}
        />
        <ResultButton
          label="A勝"
          active={match.result === "participantAWin"}
          disabled={!canEditResult}
          onClick={() => onResultChange("participantAWin")}
        />
        <ResultButton label="引き分け" active={false} disabled onClick={() => undefined} />
        <ResultButton
          label="B勝"
          active={match.result === "participantBWin"}
          disabled={!canEditResult}
          onClick={() => onResultChange("participantBWin")}
        />
      </div>
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

function ResultButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "result-button active" : "result-button"}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
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
