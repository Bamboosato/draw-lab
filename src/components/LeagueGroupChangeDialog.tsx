import { useEffect, useId, useState } from "react";
import type { LeagueGroup } from "../domain/leagueTypes";

type LeagueGroupChangeDialogProps = {
  open: boolean;
  participantName: string;
  currentGroupId?: string;
  groups: LeagueGroup[];
  onCancel: () => void;
  onSave: (groupId: string) => void;
};

export function LeagueGroupChangeDialog({
  open,
  participantName,
  currentGroupId,
  groups,
  onCancel,
  onSave,
}: LeagueGroupChangeDialogProps) {
  const titleId = useId();
  const [targetGroupId, setTargetGroupId] = useState(currentGroupId ?? groups[0]?.id ?? "");

  useEffect(() => {
    if (open) setTargetGroupId(currentGroupId ?? groups[0]?.id ?? "");
  }, [currentGroupId, groups, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog league-group-change-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>グループ変更</h2>
        <p>{participantName} の変更先グループを選択してください。</p>
        <label className="field">
          <span>変更先グループ</span>
          <select aria-label="変更先グループ" value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" title="キャンセル" onClick={onCancel}>キャンセル</button>
          <button type="button" className="button primary" title="グループ変更を確定" disabled={!targetGroupId} onClick={() => onSave(targetGroupId)}>変更する</button>
        </div>
      </section>
    </div>
  );
}
