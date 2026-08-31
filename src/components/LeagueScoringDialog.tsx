import { useEffect, useId, useState } from "react";
import type { LeagueScoringPolicy } from "../domain/leagueTypes";

type LeagueScoringDialogProps = {
  open: boolean;
  scoringPolicy: LeagueScoringPolicy;
  readOnly?: boolean;
  onCancel: () => void;
  onSave: (scoringPolicy: LeagueScoringPolicy) => void;
};

export function LeagueScoringDialog({
  open,
  scoringPolicy,
  readOnly = false,
  onCancel,
  onSave,
}: LeagueScoringDialogProps) {
  const titleId = useId();
  const [draft, setDraft] = useState(scoringPolicy);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setDraft(scoringPolicy);
      setError(undefined);
    }
  }, [open, scoringPolicy]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  const save = (): void => {
    if (readOnly) return;
    const values = [draft.winPoints, draft.drawPoints, draft.lossPoints];
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
      setError("勝点は0〜100の整数で入力してください。");
      return;
    }
    onSave(draft);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog league-scoring-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>勝点設定</h2>
        <p>{readOnly ? "完了したリーグの勝点設定は変更できません。" : "勝点を変更すると、入力済みの結果も再集計されます。"}</p>
        <div className="league-scoring-fields">
          <label className="field">
            <span>勝ち</span>
            <input type="number" min="0" max="100" step="1" value={draft.winPoints} disabled={readOnly} onChange={(event) => setDraft((current) => ({ ...current, winPoints: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span>引き分け</span>
            <input type="number" min="0" max="100" step="1" value={draft.drawPoints} disabled={readOnly} onChange={(event) => setDraft((current) => ({ ...current, drawPoints: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span>負け</span>
            <input type="number" min="0" max="100" step="1" value={draft.lossPoints} disabled={readOnly} onChange={(event) => setDraft((current) => ({ ...current, lossPoints: Number(event.target.value) }))} />
          </label>
        </div>
        {error ? <p className="validation-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button secondary" title="キャンセル" onClick={onCancel}>
            {readOnly ? "閉じる" : "キャンセル"}
          </button>
          {!readOnly ? <button type="button" className="button primary" title="勝点設定を保存" onClick={save}>保存</button> : null}
        </div>
      </section>
    </div>
  );
}
