import type { LeagueParticipant } from "./leagueTypes";

type GroupCandidate = {
  groupIndex: number;
  sameTeamCount: number;
  sameRegionCount: number;
};

/**
 * 選出者を人数差1以内に保ちながら、所属・地区の重複が少ないグループへ割り当てる。
 * 属性の分散を完全に満たせない場合も、グループ人数の均等性を優先して必ず全員を割り当てる。
 */
export function distributeLeagueParticipants(
  participants: readonly LeagueParticipant[],
  requestedGroupCount: number,
): string[][] {
  if (participants.length === 0) return [];
  const normalizedGroupCount = Number.isFinite(requestedGroupCount) ? Math.floor(requestedGroupCount) : 1;
  const groupCount = Math.max(1, Math.min(normalizedGroupCount, participants.length));
  const groups = Array.from({ length: groupCount }, () => [] as string[]);
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const originalIndexById = new Map(participants.map((participant, index) => [participant.id, index]));

  const prioritizedParticipants = participants
    .map((participant, index) => ({ participant, index, relationCount: countRelatedParticipants(participant, participants) }))
    .sort((left, right) => right.relationCount - left.relationCount || left.index - right.index);

  for (const { participant } of prioritizedParticipants) {
    const minimumSize = Math.min(...groups.map((group) => group.length));
    const candidates = groups
      .map((group, groupIndex) => ({
        group,
        ...scoreGroup(participant, group, participantById),
        groupIndex,
      }))
      .filter((candidate) => candidate.group.length === minimumSize)
      .sort(compareCandidates);

    candidates[0]!.group.push(participant.id);
  }

  return groups.map((group) => [...group].sort((left, right) => originalIndexById.get(left)! - originalIndexById.get(right)!));
}

function countRelatedParticipants(participant: LeagueParticipant, participants: readonly LeagueParticipant[]): number {
  const team = normalizeAttribute(participant.team);
  const region = normalizeAttribute(participant.region);
  if (!team && !region) return 0;

  return participants.filter((other) => other.id !== participant.id && (
    (team !== undefined && normalizeAttribute(other.team) === team)
    || (region !== undefined && normalizeAttribute(other.region) === region)
  )).length;
}

function scoreGroup(
  participant: LeagueParticipant,
  group: readonly string[],
  participantById: ReadonlyMap<string, LeagueParticipant>,
): Pick<GroupCandidate, "sameTeamCount" | "sameRegionCount"> {
  const team = normalizeAttribute(participant.team);
  const region = normalizeAttribute(participant.region);
  const members = group.map((participantId) => participantById.get(participantId)).filter((member): member is LeagueParticipant => Boolean(member));

  return {
    sameTeamCount: team ? members.filter((member) => normalizeAttribute(member.team) === team).length : 0,
    sameRegionCount: region ? members.filter((member) => normalizeAttribute(member.region) === region).length : 0,
  };
}

function compareCandidates(left: GroupCandidate, right: GroupCandidate): number {
  const leftCollisionCount = left.sameTeamCount + left.sameRegionCount;
  const rightCollisionCount = right.sameTeamCount + right.sameRegionCount;
  return leftCollisionCount - rightCollisionCount
    || left.sameTeamCount - right.sameTeamCount
    || left.sameRegionCount - right.sameRegionCount
    || left.groupIndex - right.groupIndex;
}

function normalizeAttribute(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
