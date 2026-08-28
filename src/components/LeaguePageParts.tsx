import type { ReactNode } from "react";
import type { LeagueParticipant, LeagueParticipantType } from "../domain/leagueTypes";

export function LeagueNotFound() {
  return <section className="empty-state"><h2>リーグが見つかりません。</h2><p>リーグ一覧から対象を選択してください。</p></section>;
}

export function LeagueStorageMessage({ status, error, showSaving = true }: { status: string; error?: string; showSaving?: boolean }) {
  if (showSaving && status === "saving") return <p className="storage-status" role="status">IndexedDBへ自動保存しています。</p>;
  if (status === "error") return <section className="validation-banner error" role="alert"><strong>ローカル保存を利用できません</strong><p>{error || "IndexedDBの読み書きに失敗しました。"}</p></section>;
  return null;
}

export function LeaguePageHeading({ description, actions }: { description: string; actions?: ReactNode }) {
  return <section className="page-heading"><p className="page-description">{description}</p>{actions ? <div className="button-row no-print">{actions}</div> : null}</section>;
}

export function ParticipantLabel(participant: LeagueParticipant | undefined): string {
  if (!participant) return "不明な参加単位";
  const members = participant.memberNames.filter(Boolean).join(" / ");
  return members && participant.participantType !== "individual" ? `${participant.displayName}（${members}）` : participant.displayName || "名称未設定";
}

export function participantTypeLabel(type: LeagueParticipantType): string {
  return type === "individual" ? "シングル" : type === "doubles" ? "ダブルス" : "チーム";
}
