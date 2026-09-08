import { getSetCount, normalizeSetScores, type MatchFormat, type SetScore } from "../domain/matchScoring";

export function SetScoreEditor({
  setScores,
  matchFormat,
  displayOrder,
  readOnly,
  onChange,
}: {
  setScores?: readonly SetScore[];
  matchFormat: MatchFormat;
  displayOrder: number;
  readOnly: boolean;
  onChange: (setIndex: number, participant: "participantA" | "participantB", value: number | null) => void;
}) {
  const scores = normalizeSetScores(setScores, matchFormat);

  return (
    <fieldset className="match-details">
      <legend>詳細</legend>
      {scores.slice(0, getSetCount(matchFormat)).map((score, setIndex) => (
        <div className="set-score-row" key={setIndex}>
          <span className="set-score-label">{setIndex + 1}セット</span>
          <ScoreStepper
            label={`第${displayOrder}試合 ${setIndex + 1}セット A側ゲーム数`}
            value={score.participantA}
            readOnly={readOnly}
            onChange={(value) => onChange(setIndex, "participantA", value)}
          />
          <span className="set-score-separator" aria-hidden="true">-</span>
          <ScoreStepper
            label={`第${displayOrder}試合 ${setIndex + 1}セット B側ゲーム数`}
            value={score.participantB}
            readOnly={readOnly}
            onChange={(value) => onChange(setIndex, "participantB", value)}
          />
        </div>
      ))}
    </fieldset>
  );
}

function ScoreStepper({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: number | null;
  readOnly: boolean;
  onChange: (value: number | null) => void;
}) {
  const adjust = (delta: number) => {
    const current = value ?? 0;
    onChange(Math.max(0, current + delta));
  };

  return (
    <div className="score-stepper">
      <button type="button" aria-label={`${label}を1減らす`} disabled={readOnly || value === null || value === 0} onClick={() => adjust(-1)}>-</button>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={label}
        value={value ?? ""}
        disabled={readOnly}
        onChange={(event) => onChange(parseScoreInput(event.target.value))}
      />
      <button type="button" aria-label={`${label}を1増やす`} disabled={readOnly} onClick={() => adjust(1)}>+</button>
    </div>
  );
}

function parseScoreInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
