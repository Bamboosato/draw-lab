import type { LeagueValidationIssue } from "../domain/leagueTypes";

export function LeagueValidationBanner({
  errors,
  warnings = [],
}: {
  errors: readonly LeagueValidationIssue[];
  warnings?: readonly LeagueValidationIssue[];
}) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="validation-stack">
      {errors.length > 0 ? <IssueGroup title={`エラー ${errors.length}件`} tone="error" issues={errors} /> : null}
      {warnings.length > 0 ? <IssueGroup title={`警告 ${warnings.length}件`} tone="warning" issues={warnings} /> : null}
    </div>
  );
}

function IssueGroup({ title, tone, issues }: { title: string; tone: "error" | "warning"; issues: readonly LeagueValidationIssue[] }) {
  return (
    <section className={`validation-banner ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <ul>
        {issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${issue.participantId ?? ""}-${index}`}>{issue.message}</li>)}
      </ul>
    </section>
  );
}
