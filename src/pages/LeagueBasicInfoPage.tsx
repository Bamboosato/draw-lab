import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { ensureLeagueParticipantRows } from "../app/leagueModel";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, participantTypeLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";
import type { League, LeagueParticipantType } from "../domain/leagueTypes";

export function LeagueBasicInfoPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [submitted, setSubmitted] = useState(false);
  const validationErrors = useMemo(() => {
    if (!league) return [];
    return [
      ...(!Number.isInteger(league.capacity) || league.capacity < 1 ? [{ code: "CAPACITY", message: "定員は1以上の整数で指定してください。" }] : []),
    ];
  }, [league]);
  const errors = useMemo(
    () => submitted ? validationErrors : [],
    [submitted, validationErrors],
  );

  if (!league) return <LeagueNotFound />;
  const locked = league.status === "completed" || league.matchSelectionStatus === "confirmed";

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="リーグ表に表示する大会情報と参加単位の種別を設定します。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} showSaving={false} />
      {locked ? <section className="flow-notice" role="status">対戦カード確定後のため、種目区分と定員は変更できません。</section> : null}
      <LeagueValidationBanner errors={errors} />
      <section className="form-grid">
        <label className="field">
          <span>大会名</span>
          <input value={league.title} onChange={(event) => updateLeague({ ...league, title: event.target.value })} />
        </label>
        <label className="field"><span>開催日</span><input type="date" value={league.date ?? ""} onChange={(event) => updateLeague({ ...league, date: event.target.value })} /></label>
        <label className="field"><span>会場</span><input value={league.venue ?? ""} onChange={(event) => updateLeague({ ...league, venue: event.target.value })} /></label>
        <label className="field"><span>種目名</span><input value={league.eventName ?? ""} onChange={(event) => updateLeague({ ...league, eventName: event.target.value })} /></label>
        <label className="field"><span className="required-header">種目区分<span className="required-marker" aria-label="必須">*</span></span>
          <select value={league.participantType} disabled={locked} onChange={(event) => updateLeague(changeParticipantType(league, event.target.value as LeagueParticipantType))}>
            {(["individual", "doubles", "team"] as const).map((type) => <option value={type} key={type}>{participantTypeLabel(type)}</option>)}
          </select>
        </label>
        <label className="field"><span className="required-header">定員<span className="required-marker" aria-label="必須">*</span></span>
          <input className="short-input" type="number" min="1" step="1" value={league.capacity} disabled={locked} onChange={(event) => updateLeague({ ...league, capacity: Number(event.target.value) })} />
        </label>
      </section>
      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="リーグ一覧へ戻る" onClick={() => navigate("/leagues")}>一覧</button>
        <button
          type="button"
          className="button primary"
          title="名簿入力・選出へ進む"
          disabled={errors.length > 0}
          onClick={() => {
            setSubmitted(true);
            if (validationErrors.length === 0) {
              const next = ensureLeagueParticipantRows(league);
              if (next !== league) updateLeague(next);
              navigate(`/leagues/${league.id}/edit/participants`);
            }
          }}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

function changeParticipantType(league: League, type: LeagueParticipantType): League {
  return {
    ...league,
    participantType: type,
    participants: league.participants.map((participant) => ({
      ...participant,
      participantType: type,
      memberNames: type === "doubles"
        ? [participant.memberNames[0] ?? "", participant.memberNames[1] ?? ""]
        : type === "individual" ? (participant.displayName ? [participant.displayName] : []) : participant.memberNames,
    })),
  };
}
