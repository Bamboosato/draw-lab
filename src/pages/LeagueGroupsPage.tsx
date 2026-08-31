import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { prepareLeagueMatches, updateGroups, createId } from "../app/leagueModel";
import { hasLeagueResults, validateLeague } from "../domain/leagueLogic";
import type { League, LeagueGroup, LeagueParticipant } from "../domain/leagueTypes";
import { distributeLeagueParticipants } from "../domain/leagueGrouping";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage, ParticipantLabel } from "../components/LeaguePageParts";
import { LeagueValidationBanner } from "../components/LeagueValidationBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LeagueGroupChangeDialog } from "../components/LeagueGroupChangeDialog";

export function LeagueGroupsPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [groupCount, setGroupCount] = useState(league?.groups.length || 2);
  const [pendingChange, setPendingChange] = useState<PendingChange>();
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [groupChangeTargetId, setGroupChangeTargetId] = useState<string>();

  useEffect(() => {
    setShowGroupDetails(false);
    setGroupChangeTargetId(undefined);
    setPendingChange(undefined);
    if (league) setGroupCount(league.groups.length || 2);
  }, [id, league?.id]);

  if (!league) return <LeagueNotFound />;
  const locked = league.status === "completed" || league.matchSelectionStatus === "confirmed";
  const selected = league.participants.filter((participant) => participant.selectionStatus === "selected");
  const groupRows = buildLeagueGroupRows(league, selected);
  const validation = validateLeague(league);
  const groupChangeConfirmation = league.matchSelectionStatus === "confirmed"
    ? {
      message: "グループを変更すると、確定済みの対戦カード設定がリセットされます。変更してもよろしいですか？",
      confirmLabel: "リセットして反映",
    }
    : {
      message: "グループを変更すると、確定前の対戦カード設定がリセットされます。変更してもよろしいですか？",
      confirmLabel: "リセットして反映",
    };

  const requestStructuralChange = (apply: () => void) => {
    if (locked) return;
    if (league.matches.length > 0 && !hasLeagueResults(league)) {
      setPendingChange({ apply, ...groupChangeConfirmation });
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
    const participantIdsByGroup = distributeLeagueParticipants(selected, count);
    participantIdsByGroup.forEach((participantIds, index) => { groups[index]!.participantIds = participantIds; });
    requestStructuralChange(() => updateLeague(updateGroups(league, groups)));
  };

  const moveParticipant = (participantId: string, targetGroupId: string) => {
    if (locked) return;
    const currentGroupId = league.groups.find((group) => group.participantIds.includes(participantId))?.id;
    if (currentGroupId === targetGroupId) {
      return;
    }
    const groups = league.groups.map((group) => ({
      ...group,
      participantIds: group.id === targetGroupId
        ? [...group.participantIds.filter((id) => id !== participantId), participantId]
        : group.participantIds.filter((id) => id !== participantId),
    }));
    requestStructuralChange(() => {
      updateLeague(updateGroups(league, groups));
    });
  };

  const goNext = () => {
    if (!locked && !hasLeagueResults(league)) {
      updateLeague(prepareLeagueMatches(league));
    }
    navigate(`/leagues/${league.id}/edit/matches`);
  };

  const groupDetailsToggle = (
    <button
      type="button"
      className="roster-details-toggle no-print"
      aria-controls="league-group-details-columns"
      aria-expanded={showGroupDetails}
      aria-label={showGroupDetails ? "詳細列を閉じる" : "詳細列を開く"}
      title={showGroupDetails ? "詳細列を閉じる" : "詳細列を開く"}
      onClick={() => setShowGroupDetails((current) => !current)}
    >
      {showGroupDetails ? "⊖" : "⊕"}
    </button>
  );
  const groupChangeTarget = groupRows.find((row) => row.participant.id === groupChangeTargetId);

  return (
    <div className="page-stack league-page">
      <LeaguePageHeading description="選出者をグループへ振り分け、所属・地区を確認します。対戦カードは全組み合わせを作成します。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {locked ? <section className="flow-notice" role="status">対戦カード確定後のため、グループの変更はできません。</section> : null}
      <LeagueValidationBanner errors={validation.errors.filter((issue) => issue.code === "PARTICIPANT_GROUP_REQUIRED")} warnings={validation.warnings} />
      <section className="section-card league-group-settings">
        <div className="section-card-heading">
          <div>
            <h2>グループ設定</h2>
            <p>自動振り分けでは所属・地区の重複を可能な範囲で分散します。参加単位を手動で別グループへ移動することもできます。</p>
          </div>
        </div>
        <div className="league-group-controls">
          <label className="field league-group-count-field">
            <span>グループ数</span>
            <input type="number" min="1" max={Math.max(1, selected.length)} step="1" value={groupCount} disabled={locked} onChange={(event) => setGroupCount(Number(event.target.value))} />
          </label>
          <button type="button" className="button secondary no-print" disabled={locked || selected.length === 0} onClick={distribute}>自動均等振り分け</button>
        </div>
        {league.groups.length === 0 ? <p className="empty-inline">グループ数を指定して自動均等振り分けを実行してください。</p> : (
          <div className={`table-panel roster-panel league-group-panel${showGroupDetails ? " roster-details-open" : " roster-details-collapsed"}`}>
            <table id="league-group-details-columns" className="data-table roster-table league-group-table">
              <thead>
                <tr>
                  <th className="league-group-name-column">グループ</th>
                  <th className="league-group-number-column">No.</th>
                  <th className="league-group-participant-column">選手名</th>
                  <th className="league-group-team-column roster-team-boundary-column"><span className="roster-team-heading">所属{groupDetailsToggle}</span></th>
                  <th className="roster-detail-column league-group-region-column">地区</th>
                  <th className="roster-detail-column league-group-note-column">備考</th>
                  <th className="league-group-actions-column">操作</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={`${row.group?.id ?? "unassigned"}-${row.participant.id}`}>
                    <td className="league-group-name-column">{row.group?.name ?? "未設定"}</td>
                    <td className="row-number league-group-number-column">{row.participantNumber}</td>
                    <td className="league-group-participant-column" title={ParticipantLabel(row.participant)}>{ParticipantLabel(row.participant)}</td>
                    <td className="league-group-team-column">{row.participant.team || "-"}</td>
                    <td className="roster-detail-column league-group-region-column">{row.participant.region || "-"}</td>
                    <td className="roster-detail-column league-group-note-column">{row.participant.note || "-"}</td>
                    <td className="league-group-actions-column">
                      <button type="button" className="button secondary" title="この参加者のグループを変更" disabled={locked || league.groups.length < 2} onClick={() => setGroupChangeTargetId(row.participant.id)}>グループ変更</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="bottom-actions no-print"><button type="button" className="button secondary" title="名簿入力・選出へ戻る" onClick={() => navigate(`/leagues/${league.id}/edit/participants`)}>戻る</button><button type="button" className="button primary" title="対戦カードへ進む" disabled={league.groups.length === 0 || selected.length < 2} onClick={goNext}>次へ</button></div>
      <LeagueGroupChangeDialog
        open={Boolean(groupChangeTarget)}
        participantName={groupChangeTarget ? ParticipantLabel(groupChangeTarget.participant) : "参加単位"}
        currentGroupId={groupChangeTarget?.group?.id}
        groups={league.groups}
        onCancel={() => setGroupChangeTargetId(undefined)}
        onSave={(targetGroupId) => {
          if (groupChangeTarget) moveParticipant(groupChangeTarget.participant.id, targetGroupId);
          setGroupChangeTargetId(undefined);
        }}
      />
      <ConfirmDialog open={pendingChange !== undefined} title="グループを変更します" message={pendingChange?.message ?? "グループを変更すると、確定前の対戦カード設定がリセットされます。変更してもよろしいですか？"} confirmLabel={pendingChange?.confirmLabel ?? "リセットして反映"} cancelLabel="キャンセル" onCancel={() => setPendingChange(undefined)} onConfirm={() => { if (pendingChange) pendingChange.apply(); setPendingChange(undefined); }} />
    </div>
  );
}

type PendingChange = {
  apply: () => void;
  message: string;
  confirmLabel: string;
};

type LeagueGroupRow = {
  group?: LeagueGroup;
  participant: LeagueParticipant;
  participantNumber: number;
};

function buildLeagueGroupRows(league: League, selected: LeagueParticipant[]): LeagueGroupRow[] {
  const participantById = new Map(league.participants.map((participant, index) => [participant.id, { participant, participantNumber: index + 1 }]));
  const selectedIds = new Set(selected.map((participant) => participant.id));
  const assignedIds = new Set<string>();
  const sortedGroups = league.groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => left.group.name.localeCompare(right.group.name, "ja", { numeric: true }) || left.index - right.index);
  const assignedRows = sortedGroups.flatMap(({ group }) => Array.from(new Set(group.participantIds))
    .filter((participantId) => selectedIds.has(participantId))
    .flatMap((participantId) => {
      const entry = participantById.get(participantId);
      if (!entry) return [];
      assignedIds.add(participantId);
      return [{ group, participant: entry.participant, participantNumber: entry.participantNumber }];
    })
    .sort((left, right) => left.participantNumber - right.participantNumber));
  const unassignedRows = selected
    .filter((participant) => !assignedIds.has(participant.id))
    .map((participant) => ({ participant, participantNumber: participantById.get(participant.id)?.participantNumber ?? Number.MAX_SAFE_INTEGER }));

  return [...assignedRows, ...unassignedRows.sort((left, right) => left.participantNumber - right.participantNumber)];
}
