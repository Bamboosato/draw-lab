import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { prepareLeagueMatches, updateGroups, updateMatchPolicy, updateScoringPolicy, createId } from "../app/leagueModel";
import { hasLeagueResults, validateLeague } from "../domain/leagueLogic";
import type { LeagueGroup, LeagueMatchMode } from "../domain/leagueTypes";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function LeagueGroupsPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [groupCount, setGroupCount] = useState(league?.groups.length || 2);
  const [pendingChange, setPendingChange] = useState<PendingChange>();

  if (!league) return <LeagueNotFound />;
  const locked = hasLeagueResults(league);
  const selected = league.participants.filter((participant) => participant.selectionStatus === "selected");
  const validation = validateLeague(league);

  const requestStructuralChange = (apply: () => void, message: string) => {
    if (locked) return;
    if (league.matches.length > 0 && !hasLeagueResults(league)) {
      setPendingChange({ apply, message });
      return;
    }
    apply();
  };

  const distribute = () => {
    if (locked) return;
    const count = Math.max(1, Math.min(groupCount, selected.length || 1));
    const groups: LeagueGroup[] = Array.from({ length: count }, (_, index) => ({
      id: league.groups[index]?.id ?? createId("group"),
      name: league.groups[index]?.name ?? String.fromCharCode(65 + index),
      participantIds: [],
    }));
    selected.forEach((participant, index) => groups[index % groups.length]!.participantIds.push(participant.id));
    requestStructuralChange(() => updateLeague(updateGroups(league, groups)), "グループ分けを変更すると、現在の候補カードを再構成します。結果入力前のため、カードの有効状態は初期化されます。続けますか？");
  };

  const moveParticipant = (participantId: string, targetGroupId: string) => {
    if (locked) return;
    const groups = league.groups.map((group) => ({
      ...group,
      participantIds: group.id === targetGroupId
        ? [...group.participantIds.filter((id) => id !== participantId), participantId]
        : group.participantIds.filter((id) => id !== participantId),
    }));
    requestStructuralChange(() => updateLeague(updateGroups(league, groups)), "グループを変更すると、現在の候補カードを再構成します。結果入力前のため、カードの有効状態は初期化されます。続けますか？");
  };

  const setMode = (mode: LeagueMatchMode) => requestStructuralChange(() => updateLeague(updateMatchPolicy(league, { ...league.matchPolicy, mode })), "対戦方式を変更すると、現在の候補カードを再構成します。結果入力前のため、カードの有効状態は初期化されます。続けますか？");
  const setMatchesPerParticipant = (value: number) => requestStructuralChange(() => updateLeague(updateMatchPolicy(league, { ...league.matchPolicy, matchesPerParticipant: value })), "指定試合数を変更すると、現在の候補カードを再構成します。結果入力前のため、カードの有効状態は初期化されます。続けますか？");
  const setPoints = (key: "winPoints" | "drawPoints" | "lossPoints", value: number) => updateLeague(updateScoringPolicy(league, { ...league.scoringPolicy, [key]: value }));

  const goNext = () => {
    const withMatches = prepareLeagueMatches(league);
    updateLeague(withMatches);
    navigate(`/leagues/${league.id}/edit/matches`);
  };

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="選出者をグループへ振り分け、総当たりまたは部分当たりと勝点を設定します。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {locked ? <section className="flow-notice" role="status">結果入力後のため、グループ・対戦方式の変更はできません。</section> : null}
      <LeagueValidationBanner errors={validation.errors.filter((issue) => issue.code === "PARTICIPANT_GROUP_REQUIRED" || issue.code === "SCORING_INVALID")} warnings={validation.warnings} />
      <section className="form-grid">
        <label className="field"><span>グループ数</span><input type="number" min="1" max={Math.max(1, selected.length)} step="1" value={groupCount} disabled={locked} onChange={(event) => setGroupCount(Number(event.target.value))} /><button type="button" className="button secondary no-print" disabled={locked || selected.length === 0} onClick={distribute}>自動均等振り分け</button></label>
        <label className="field"><span>対戦方式</span><select value={league.matchPolicy.mode} disabled={locked} onChange={(event) => setMode(event.target.value as LeagueMatchMode)}><option value="roundRobin">総当たり</option><option value="partialRoundRobin">部分当たり</option></select></label>
        {league.matchPolicy.mode === "partialRoundRobin" ? <label className="field"><span>1対戦参加単位あたりの試合数</span><input type="number" min="1" step="1" value={league.matchPolicy.matchesPerParticipant ?? ""} disabled={locked} onChange={(event) => setMatchesPerParticipant(Number(event.target.value))} /><small className="field-help">シングルは1人、ダブルスは1ペア、チームは1チームを数えます。</small></label> : null}
        <label className="field"><span>勝ちの勝点</span><input type="number" min="0" max="100" step="1" value={league.scoringPolicy.winPoints} disabled={locked} onChange={(event) => setPoints("winPoints", Number(event.target.value))} /></label>
        <label className="field"><span>引き分けの勝点</span><input type="number" min="0" max="100" step="1" value={league.scoringPolicy.drawPoints} disabled={locked} onChange={(event) => setPoints("drawPoints", Number(event.target.value))} /></label>
        <label className="field"><span>負けの勝点</span><input type="number" min="0" max="100" step="1" value={league.scoringPolicy.lossPoints} disabled={locked} onChange={(event) => setPoints("lossPoints", Number(event.target.value))} /></label>
      </section>
      <section className="section-card"><div className="section-card-heading"><div><h2>グループ</h2><p>参加単位を手動で別グループへ移動することもできます。</p></div></div>{league.groups.length === 0 ? <p className="empty-inline">グループ数を指定して自動均等振り分けを実行してください。</p> : <div className="league-group-grid">{league.groups.map((group) => <section className="league-group-card" key={group.id}><h3>{group.name}</h3><p>{group.participantIds.length}参加単位</p>{group.participantIds.map((participantId) => { const participant = league.participants.find((item) => item.id === participantId); return <label className="group-participant" key={participantId}><span>{ParticipantLabel(participant)}</span><select aria-label={`${ParticipantLabel(participant)}のグループ`} value={group.id} disabled={locked} onChange={(event) => moveParticipant(participantId, event.target.value)}>{league.groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; })}</section>)}</div>}</section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" onClick={() => navigate(`/leagues/${league.id}/edit/participants`)}>戻る</button><button type="button" className="button primary" disabled={locked || league.groups.length === 0 || selected.length < 2} onClick={goNext}>対戦カード作成へ</button></div>
      <ConfirmDialog open={pendingChange !== undefined} title="リーグ設定を変更します" message={pendingChange?.message ?? "現在の候補カードを再構成します。続けますか？"} confirmLabel="再構成する" cancelLabel="キャンセル" onCancel={() => setPendingChange(undefined)} onConfirm={() => { if (pendingChange) pendingChange.apply(); setPendingChange(undefined); }} />
    </div>
  );
}

type PendingChange = {
  apply: () => void;
  message: string;
};
