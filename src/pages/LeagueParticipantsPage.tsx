import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague, useLeagues } from "../app/LeagueProvider";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { canReplaceSelectedParticipantWithReserve, createId, createLeagueParticipant, ensureLeagueParticipantRows, mergeLeagueParticipantsIntoEmptyRows, parseLeagueParticipantsFromText, replaceSelectedParticipantWithReserve, selectParticipantIds, updateParticipants, updateSelection } from "../app/leagueModel";
import { validateParticipants } from "../app/leagueFlow";
import { CompactSummary } from "../components/CompactSummary";
import { LeagueNotFound, LeaguePageHeading, LeagueStorageMessage } from "../components/LeaguePageParts";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OverflowMenu } from "../components/OverflowMenu";
import { hasLeagueResults, isLeagueParticipantEmpty } from "../domain/leagueLogic";
import type { League, LeagueParticipant } from "../domain/leagueTypes";

export function LeagueParticipantsPage() {
  const { id } = useParams();
  const league = useLeague(id);
  const { updateLeague, storageError, storageStatus } = useLeagues();
  const navigate = useViewTransitionNavigate();
  const [pasteText, setPasteText] = useState("");
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipantChange>();
  const [pendingSelection, setPendingSelection] = useState<PendingSelectionChange>();
  const [replacementTargetId, setReplacementTargetId] = useState<string>();
  const [replacementReserveId, setReplacementReserveId] = useState("");
  const [structureResetNotice, setStructureResetNotice] = useState(false);
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const [showRosterDetails, setShowRosterDetails] = useState(false);

  useEffect(() => {
    setChecked(false);
    setShowRosterDetails(false);
    setStructureResetNotice(false);
    setPendingSelection(undefined);
    setReplacementTargetId(undefined);
    setReplacementReserveId("");
    setPasteText("");
  }, [league?.id, league?.participantType]);

  useEffect(() => {
    if (!league || hasLeagueResults(league) || league.groups.length > 0 || league.matches.length > 0) return;
    const next = ensureLeagueParticipantRows(league);
    if (next !== league) updateLeague(next);
  }, [league, updateLeague]);

  const errors = useMemo(() => league ? validateParticipants(league) : [], [league]);
  if (!league) return <LeagueNotFound />;
  const locked = league.status === "completed" || league.matchSelectionStatus === "confirmed";
  const participantName = participantNameLabel(league.participantType);
  const participantCount = league.participants.filter((participant) => !isLeagueParticipantEmpty(participant)).length;
  const completeParticipantCount = league.participants.filter(isCompleteParticipant).length;
  const enteredParticipantIds = league.participants
    .filter((participant) => !isLeagueParticipantEmpty(participant))
    .map((participant) => participant.id);
  const selectedCount = league.participants.filter((participant) => participant.selectionStatus === "selected" && !isLeagueParticipantEmpty(participant)).length;
  const selectionErrors = completeParticipantCount > 0
    ? selectedCount > league.capacity
      ? [`選出者数が定員${league.capacity}名を超えています。`]
      : selectedCount === 0 ? ["選出者を1名以上選択してください。"] : []
    : [];
  const hasBlockingErrors = errors.length > 0 || completeParticipantCount === 0 || selectionErrors.length > 0;
  const shouldBlockNext = checked && hasBlockingErrors;
  const replacementTarget = league.participants.find((participant) => participant.id === replacementTargetId);
  const replacementCandidates = league.participants.filter((participant) => (
    participant.selectionStatus === "reserve"
    && !isLeagueParticipantEmpty(participant)
    && isCompleteParticipant(participant)
  ));
  const replacementAllowed = canReplaceSelectedParticipantWithReserve(league)
    && !locked
    && replacementCandidates.length > 0;
  const applyParticipantUpdate = (participants: LeagueParticipant[], clearPaste = false) => {
    const next = updateParticipants(league, participants);
    if ((league.groups.length > 0 || league.matches.length > 0)
      && next.groups.length === 0
      && next.matches.length === 0) {
      setStructureResetNotice(true);
    }
    if (clearPaste) setPasteText("");
    updateLeague(next);
  };
  const requestParticipantUpdate = (participants: LeagueParticipant[], clearPaste = false) => {
    if (locked) return;
    const preview = updateParticipants(league, participants);
    const participantsChanged = JSON.stringify(league.participants.filter((participant) => (
      participant.selectionStatus === "selected" && !isLeagueParticipantEmpty(participant)
    ))) !== JSON.stringify(preview.participants.filter((participant) => (
      participant.selectionStatus === "selected" && !isLeagueParticipantEmpty(participant)
    )));
    if (participantsChanged && (league.groups.length > 0 || league.matches.length > 0)) {
      setPendingParticipants({ participants, clearPaste });
      return;
    }
    applyParticipantUpdate(participants, clearPaste);
  };

  const addParticipant = () => {
    requestParticipantUpdate([...league.participants, createLeagueParticipant(league.participants.length + 1, league.participantType)]);
  };

  const removeEmptyParticipants = () => {
    requestParticipantUpdate(league.participants.filter((participant) => !isLeagueParticipantEmpty(participant)));
  };

  const goNext = () => {
    setChecked(true);
    if (hasBlockingErrors) return;
    navigate(`/leagues/${league.id}/edit/groups`);
  };

  const requestSelectionUpdate = (next: League) => {
    if (locked) return;
    const selectedChanged = JSON.stringify(league.selection.selectedParticipantIds) !== JSON.stringify(next.selection.selectedParticipantIds);
    if (selectedChanged && (league.groups.length > 0 || league.matches.length > 0)) {
      setPendingSelection({ league: next });
      return;
    }
    updateLeague(next);
  };

  const updateParticipantSelection = (participantId: string, selected: boolean) => {
    if (locked) return;
    const selectedIds = new Set(
      league.participants
        .filter((participant) => participant.selectionStatus === "selected" && !isLeagueParticipantEmpty(participant))
        .map((participant) => participant.id),
    );
    if (selected) selectedIds.add(participantId);
    else selectedIds.delete(participantId);
    const nextSelectedIds = enteredParticipantIds.filter((candidate) => selectedIds.has(candidate));
    const reserveIds = enteredParticipantIds.filter((candidate) => !selectedIds.has(candidate));
    requestSelectionUpdate(updateSelection(league, "manual", nextSelectedIds, reserveIds, league.selection.randomSeed));
  };

  const autoSelect = () => {
    if (locked) return;
    const randomSeed = createId("selection");
    const selectedIds = selectParticipantIds(enteredParticipantIds, league.capacity, randomSeed);
    const selected = new Set(selectedIds);
    requestSelectionUpdate(updateSelection(
      league,
      "random",
      selectedIds,
      enteredParticipantIds.filter((participantId) => !selected.has(participantId)),
      randomSeed,
    ));
  };

  const openReplacement = (participantId: string) => {
    if (!replacementAllowed) return;
    setReplacementTargetId(participantId);
    setReplacementReserveId("");
  };

  const closeReplacement = () => {
    setReplacementTargetId(undefined);
    setReplacementReserveId("");
  };

  const applyReplacement = () => {
    if (!replacementTargetId || !replacementReserveId) return;
    const next = replaceSelectedParticipantWithReserve(league, replacementTargetId, replacementReserveId);
    if (next === league) return;
    updateLeague(next);
    closeReplacement();
  };

  const rosterDetailsToggle = (
    <button
      type="button"
      className="roster-details-toggle no-print"
      aria-controls="league-participant-details-columns"
      aria-expanded={showRosterDetails}
      aria-label={showRosterDetails ? "詳細列を閉じる" : "詳細列を開く"}
      title={showRosterDetails ? "詳細列を閉じる" : "詳細列を開く"}
      onClick={() => setShowRosterDetails((current) => !current)}
    >
      {showRosterDetails ? "⊖" : "⊕"}
    </button>
  );

  return (
    <div className="page-stack league-page league-participants-page">
      <LeaguePageHeading
        description="シングル・ペア・チームを登録し、チェックボックスで選出者を指定します。チェックなしの参加者は補欠として扱います。"
        actions={(
          <>
            <button type="button" className="button secondary" title="定員分の参加者をランダムに選出" onClick={autoSelect} disabled={locked}>自動選出</button>
            <OverflowMenu
              triggerLabel="名簿のその他の操作"
              triggerTitle="名簿のその他の操作"
              disabled={locked}
              menuWidth={208}
              sections={[{
                label: "名簿操作",
                items: [
                  { label: "行追加", title: "名簿の入力行を追加", icon: "entrants", onSelect: addParticipant },
                  { label: "空行削除", title: "空の名簿行を削除", icon: "delete", danger: true, onSelect: removeEmptyParticipants },
                  { label: "入力チェック", title: "名簿の入力内容をチェック", icon: "options", onSelect: () => setChecked(true) },
                ],
              }]}
            />
          </>
        )}
      />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      {structureResetNotice ? <section className="flow-notice" role="status">参加者を変更したため、グループと対戦カード設定をリセットしました。勝点設定は保持しています。</section> : null}
       {locked ? <section className="flow-notice" role="status">対戦カード確定後のため、参加者の追加・削除・種別変更・入替はできません。</section> : null}
      <CompactSummary
        ariaLabel="参加者入力概要"
        items={[
          { label: "参加者数", value: String(participantCount) },
          { label: "選択済み", value: String(selectedCount) },
          { label: "定員", value: String(league.capacity) },
        ]}
        statusMessages={checked ? [...errors.map((error) => error.message), ...selectionErrors] : []}
      />
      {league.participants.length === 0 ? <p className="empty-inline">参加者を追加してください。</p> : (
        <div className={`table-panel roster-panel${showRosterDetails ? " roster-details-open" : " roster-details-collapsed"}`}>
            <table id="league-participant-details-columns" className="data-table roster-table league-participant-table">
              <thead>
                <tr>
                  <th className="league-selection-column">選出</th>
                  <th className="league-participant-number-column">No.</th>
                  <th className="league-participant-name-column">{participantName}</th>
                  {league.participantType === "doubles" ? <><th className="league-participant-member-column">選手名1</th><th className="league-participant-member-column">選手名2</th></> : null}
                  {league.participantType === "team" ? <th className="league-participant-member-column">メンバー（/区切り）</th> : null}
                  <th className="league-participant-team-column roster-team-boundary-column"><span className="roster-team-heading">所属{rosterDetailsToggle}</span></th>
                  <th className="roster-detail-column league-participant-region-column">地区</th>
                  <th className="roster-detail-column league-participant-note-column">備考</th>
                  {!locked ? <th className="league-participant-actions-column">操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {league.participants.map((participant, index) => (
                  <ParticipantRow
                    key={participant.id}
                    participant={participant}
                    index={index}
                    locked={locked}
                    draftResetKey={draftResetKey}
                    onChange={(next) => requestParticipantUpdate(league.participants.map((item) => item.id === next.id ? next : item))}
                    onRemove={() => requestParticipantUpdate(league.participants.filter((item) => item.id !== participant.id))}
                    onReplace={() => openReplacement(participant.id)}
                    onSelectionChange={(selected) => updateParticipantSelection(participant.id, selected)}
                    replacementAllowed={replacementAllowed}
                    hasReplacementCandidates={replacementCandidates.length > 0}
                    type={league.participantType}
                  />
                ))}
              </tbody>
            </table>
        </div>
      )}
      {!locked ? (
        <section className="paste-panel no-print">
          <label className="field"><span>TSV/CSV貼り付け</span><textarea aria-label="TSV/CSV貼り付け" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={pastePlaceholder(league.participantType)} /></label>
          <div className="button-row"><button type="button" className="button secondary" title="貼り付けたTSV/CSVを名簿に取り込む" disabled={!pasteText.trim()} onClick={() => requestParticipantUpdate(mergeLeagueParticipantsIntoEmptyRows(league.participants, parseLeagueParticipantsFromText(pasteText, league.participantType)), true)}>貼り付けを取り込み</button></div>
          <p className="field-help">1行1参加者。シングルは「選手名・所属・地区・備考」、ダブルスは「ペア名・選手名1・選手名2・所属・地区・備考」、チームは「チーム名・メンバー（/区切り）・所属・地区・備考」の順で入力できます。</p>
        </section>
      ) : null}
      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="リーグ一覧へ戻る" onClick={() => navigate("/leagues")}>一覧</button>
        <button type="button" className="button secondary" title="基本情報へ戻る" onClick={() => navigate(`/leagues/${league.id}/edit/basic`)}>戻る</button>
        <button type="button" className="button primary" title="グループ設定へ進む" disabled={shouldBlockNext} onClick={goNext}>{shouldBlockNext ? "エラー修正後に次へ" : "次へ"}</button>
      </div>
      <ConfirmDialog open={pendingParticipants !== undefined} title="参加者の変更を反映します" message="参加者を変更すると、既存のグループ分けと対戦カード設定がリセットされます。勝点設定は保持されます。変更してよろしいですか？" confirmLabel="リセットして反映" cancelLabel="キャンセル" onCancel={() => { setPendingParticipants(undefined); setDraftResetKey((current) => current + 1); }} onConfirm={() => { if (pendingParticipants) applyParticipantUpdate(pendingParticipants.participants, pendingParticipants.clearPaste); setPendingParticipants(undefined); }} />
      <ConfirmDialog open={pendingSelection !== undefined} title="選出内容を変更します" message="選出者を変更すると、既存のグループと対戦カード設定がリセットされます。変更してよろしいですか？" confirmLabel="リセットして反映" cancelLabel="キャンセル" onCancel={() => setPendingSelection(undefined)} onConfirm={() => { if (pendingSelection) updateLeague(pendingSelection.league); setPendingSelection(undefined); }} />
      <ConfirmDialog
        open={replacementTarget !== undefined}
        className="replacement-dialog"
        title="参加者を入れ替える"
        message="入れ替える補欠を選択してください。入替後は同じグループ位置の対戦カードを更新します。"
        confirmLabel="入替を実行"
        cancelLabel="キャンセル"
        confirmDisabled={!replacementReserveId}
        onCancel={closeReplacement}
        onConfirm={applyReplacement}
      >
        {replacementTarget ? (
          <div className="replacement-dialog-fields">
            <p><strong>入替対象：</strong>{participantOptionLabel(replacementTarget)}</p>
            <label className="field">
              <span>入れ替える補欠</span>
              <select aria-label="入れ替える補欠" value={replacementReserveId} onChange={(event) => setReplacementReserveId(event.target.value)}>
                <option value="">補欠参加者を選択してください</option>
                {replacementCandidates.map((participant) => <option key={participant.id} value={participant.id}>{participantOptionLabel(participant)}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function ParticipantRow({ participant, index, locked, draftResetKey, onChange, onRemove, onReplace, onSelectionChange, replacementAllowed, hasReplacementCandidates, type }: { participant: LeagueParticipant; index: number; locked: boolean; draftResetKey: number; onChange: (participant: LeagueParticipant) => void; onRemove: () => void; onReplace: () => void; onSelectionChange: (selected: boolean) => void; replacementAllowed: boolean; hasReplacementCandidates: boolean; type: LeagueParticipant["participantType"] }) {
  const [draft, setDraft] = useState(participant);
  useEffect(() => setDraft(participant), [participant, draftResetKey]);
  const nameLabel = participantNameLabel(type);
  const set = (patch: Partial<LeagueParticipant>) => setDraft((current) => ({ ...current, ...patch }));
  const setMember = (memberIndex: number, value: string) => setDraft((current) => ({ ...current, memberNames: current.memberNames.map((member, currentIndex) => currentIndex === memberIndex ? value : member) }));
  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(participant)) onChange(draft);
  };
  const isEntered = !isLeagueParticipantEmpty(participant);
  const isReserve = isEntered && participant.selectionStatus !== "selected";
  const canReplace = replacementAllowed && isEntered && participant.selectionStatus === "selected";
  const replaceTitle = canReplace
    ? "この参加者を補欠と入れ替える"
    : participant.selectionStatus !== "selected"
      ? "選出済みの参加者だけ入れ替えできます"
      : !hasReplacementCandidates
        ? "入れ替え可能な補欠がいません"
      : "対戦カード未確定かつ結果入力前だけ入れ替えできます";
  return (
    <tr className={isReserve ? "league-participant-reserve-row" : undefined}>
      <td className="league-selection-column"><input type="checkbox" aria-label={`${index + 1} ${nameLabel}を選出`} checked={isEntered && participant.selectionStatus === "selected"} disabled={locked || !isEntered} onChange={(event) => onSelectionChange(event.target.checked)} /></td>
      <td className="row-number">{index + 1}</td>
      <td className="league-participant-name-column"><input aria-label={`${index + 1} ${nameLabel}`} value={draft.displayName} disabled={locked} onChange={(event) => set({ displayName: event.target.value })} onBlur={commit} /></td>
      {type === "doubles" ? <>
        <td className="league-participant-member-column"><input aria-label={`${index + 1} メンバー1`} value={draft.memberNames[0] ?? ""} disabled={locked} onChange={(event) => setMember(0, event.target.value)} onBlur={commit} /></td>
        <td className="league-participant-member-column"><input aria-label={`${index + 1} メンバー2`} value={draft.memberNames[1] ?? ""} disabled={locked} onChange={(event) => setMember(1, event.target.value)} onBlur={commit} /></td>
      </> : null}
      {type === "team" ? <td className="league-participant-member-column"><input aria-label={`${index + 1} メンバー`} value={draft.memberNames.join("/")} disabled={locked} onChange={(event) => setDraft((current) => ({ ...current, memberNames: event.target.value.split("/").map((member) => member.trim()) }))} onBlur={commit} /></td> : null}
      <td className="league-participant-team-column"><input aria-label={`${index + 1} 所属`} value={draft.team ?? ""} disabled={locked} onChange={(event) => set({ team: event.target.value })} onBlur={commit} /></td>
      <td className="roster-detail-column league-participant-region-column"><input aria-label={`${index + 1} 地区`} value={draft.region ?? ""} disabled={locked} onChange={(event) => set({ region: event.target.value })} onBlur={commit} /></td>
      <td className="roster-detail-column league-participant-note-column"><input aria-label={`${index + 1} 備考`} value={draft.note ?? ""} disabled={locked} onChange={(event) => set({ note: event.target.value })} onBlur={commit} /></td>
       {!locked ? <td className="league-participant-actions-column"><div className="inline-actions"><button type="button" className="button secondary" title={replaceTitle} disabled={!canReplace} onClick={onReplace}>入替</button><button type="button" className="danger-link" title="この参加者を削除" onClick={onRemove}>削除</button></div></td> : null}
    </tr>
  );
}

type PendingParticipantChange = {
  participants: LeagueParticipant[];
  clearPaste: boolean;
};

type PendingSelectionChange = {
  league: League;
};

function isCompleteParticipant(participant: LeagueParticipant): boolean {
  if (!participant.displayName.trim()) return false;
  const memberCount = participant.memberNames.filter((member) => member.trim()).length;
  if (participant.participantType === "doubles") return memberCount === 2;
  if (participant.participantType === "team") return memberCount >= 1;
  return true;
}

function participantOptionLabel(participant: LeagueParticipant): string {
  const details = [participant.team, participant.region].filter((value) => value?.trim()).join("・");
  return details ? `${participant.displayName}（${details}）` : participant.displayName;
}

function participantNameLabel(type: LeagueParticipant["participantType"]): string {
  if (type === "doubles") return "ペア名";
  if (type === "team") return "チーム名";
  return "選手名";
}

function pastePlaceholder(type: LeagueParticipant["participantType"]): string {
  if (type === "doubles") return "ペアA\t選手A\t選手B\t所属A\t地区A\t備考A\nペアB\t選手C\t選手D\t所属B\t地区B\t備考B";
  if (type === "team") return "チームA\tメンバーA/メンバーB\t所属A\t地区A\t備考A";
  return "選手A\t所属A\t地区A\t備考A\n選手B\t所属B\t地区B\t備考B\n選手C\t所属C\t地区C\t備考C";
}
