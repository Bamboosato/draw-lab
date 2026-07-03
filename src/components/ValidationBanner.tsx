import type { Entrant, ValidationIssue } from "../domain/types";

export function ValidationBanner({
  errors,
  warnings,
  compact = false,
  entrants = [],
}: {
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
  compact?: boolean;
  entrants?: readonly Entrant[];
}) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  const targetNoByEntrantId = buildTargetNoByEntrantId(entrants);

  return (
    <div className={`validation-stack ${compact ? "compact" : ""}`}>
      {errors.length > 0 ? (
        <IssueGroup
          title={`エラー ${errors.length}件`}
          tone="error"
          issues={errors}
          targetNoByEntrantId={targetNoByEntrantId}
        />
      ) : null}
      {warnings.length > 0 ? (
        <IssueGroup
          title={`警告 ${warnings.length}件`}
          tone="warning"
          issues={warnings}
          targetNoByEntrantId={targetNoByEntrantId}
        />
      ) : null}
    </div>
  );
}

type IssueSummary = {
  key: string;
  message: string;
  targetNos: string[];
};

function IssueGroup({
  title,
  tone,
  issues,
  targetNoByEntrantId,
}: {
  title: string;
  tone: "error" | "warning";
  issues: readonly ValidationIssue[];
  targetNoByEntrantId: ReadonlyMap<string, string>;
}) {
  const summaries = summarizeIssues(issues, targetNoByEntrantId);
  const visibleSummaries = summaries.slice(0, 5);
  const summaryText = tone === "error"
    ? `入力内容に${issues.length}件のエラーがあります。修正してから次へ進んでください。`
    : `確認が必要な内容が${issues.length}件あります。内容を確認してください。`;

  return (
    <section className={`validation-banner ${tone}`}>
      <div className="validation-banner-header">
        <strong>{title}</strong>
      </div>
      <p className="validation-banner-summary">{summaryText}</p>
      <div className="validation-banner-details">
        <ul>
          {visibleSummaries.map((summary) => (
            <li key={summary.key}>
              {summary.message}
              {summary.targetNos.length > 0 ? (
                <span>（対象No.: {formatTargetNos(summary.targetNos)}）</span>
              ) : null}
            </li>
          ))}
        </ul>
        {summaries.length > visibleSummaries.length ? (
          <p>ほか {summaries.length - visibleSummaries.length} 種類の内容があります。</p>
        ) : null}
      </div>
    </section>
  );
}

function buildTargetNoByEntrantId(entrants: readonly Entrant[]): ReadonlyMap<string, string> {
  return new Map(entrants.map((entrant, index) => [entrant.id, String(index + 1)]));
}

function summarizeIssues(
  issues: readonly ValidationIssue[],
  targetNoByEntrantId: ReadonlyMap<string, string>,
): IssueSummary[] {
  const summaries = new Map<string, IssueSummary>();

  for (const issue of issues) {
    const key = `${issue.code}-${issue.field ?? ""}-${issue.message}`;
    const summary = summaries.get(key) ?? {
      key,
      message: issue.message,
      targetNos: [],
    };
    const targetNo = issue.entrantId ? targetNoByEntrantId.get(issue.entrantId) : undefined;

    if (targetNo && !summary.targetNos.includes(targetNo)) {
      summary.targetNos.push(targetNo);
    }

    summaries.set(key, summary);
  }

  return Array.from(summaries.values());
}

function formatTargetNos(targetNos: readonly string[]): string {
  const visibleTargetNos = targetNos.slice(0, 12);
  const remainingCount = targetNos.length - visibleTargetNos.length;

  return remainingCount > 0
    ? `${visibleTargetNos.join(", ")} ほか${remainingCount}件`
    : visibleTargetNos.join(", ");
}
