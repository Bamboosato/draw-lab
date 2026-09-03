export type MatchResultSelection =
  | "unplayed"
  | "participantAWin"
  | "draw"
  | "participantBWin";

export function MatchWinnerSelector({
  ariaLabel,
  participantALabel,
  participantBLabel,
  result,
  disabled = false,
  drawDisabled = false,
  onResultChange,
}: {
  ariaLabel: string;
  participantALabel: string;
  participantBLabel: string;
  result: MatchResultSelection;
  disabled?: boolean;
  drawDisabled?: boolean;
  onResultChange: (result: MatchResultSelection) => void;
}) {
  const selectResult = (nextResult: MatchResultSelection) => {
    onResultChange(result === nextResult ? "unplayed" : nextResult);
  };

  return (
    <div className="match-winner-selector" role="group" aria-label={ariaLabel}>
      <div className="match-participant-buttons">
        <ParticipantButton
          label={participantALabel}
          active={result === "participantAWin"}
          disabled={disabled}
          onClick={() => selectResult("participantAWin")}
        />
        <span className="match-vs">vs</span>
        <ParticipantButton
          label={participantBLabel}
          active={result === "participantBWin"}
          disabled={disabled}
          onClick={() => selectResult("participantBWin")}
        />
      </div>
      <button
        type="button"
        className={result === "draw" && !drawDisabled ? "match-draw-button active" : "match-draw-button"}
        aria-pressed={result === "draw"}
        disabled={disabled || drawDisabled}
        onClick={() => selectResult("draw")}
      >
        引き分け
      </button>
    </div>
  );
}

function ParticipantButton({
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
      className={active ? "match-participant-button active" : "match-participant-button"}
      aria-label={`${label}の勝ち`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
