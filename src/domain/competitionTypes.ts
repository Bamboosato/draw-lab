export type CompetitionParticipantType = "individual" | "doubles" | "team";

export type CompetitionBasicInfo = {
  title: string;
  date: string;
  venue: string;
  eventName: string;
  participantType: CompetitionParticipantType;
};

export type CommonParticipantMember = {
  name: string;
  affiliation?: string;
};

export type CommonParticipantUnit = {
  id: string;
  participantType: CompetitionParticipantType;
  displayName: string;
  members: CommonParticipantMember[];
  affiliation?: string;
  region?: string;
  note?: string;
};
