import type { ValidationIssue } from "../domain/types";

export function ValidationBanner({
  errors,
  warnings,
  compact = false,
}: {
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
  compact?: boolean;
}) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className={`validation-stack ${compact ? "compact" : ""}`}>
      {errors.length > 0 ? (
        <IssueGroup title={`エラー ${errors.length}件`} tone="error" issues={errors} />
      ) : null}
      {warnings.length > 0 ? (
        <IssueGroup title={`警告 ${warnings.length}件`} tone="warning" issues={warnings} />
      ) : null}
    </div>
  );
}

function IssueGroup({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: "error" | "warning";
  issues: readonly ValidationIssue[];
}) {
  const visibleIssues = issues.slice(0, 8);

  return (
    <section className={`validation-banner ${tone}`}>
      <strong>{title}</strong>
      <ul>
        {visibleIssues.map((issue, index) => (
          <li key={`${issue.code}-${issue.entrantId ?? issue.field ?? index}`}>
            {issue.message}
            {issue.entrantId ? <span>（行ID: {issue.entrantId}）</span> : null}
          </li>
        ))}
      </ul>
      {issues.length > visibleIssues.length ? (
        <p>ほか {issues.length - visibleIssues.length} 件があります。</p>
      ) : null}
    </section>
  );
}
