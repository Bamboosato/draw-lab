type SummaryItem = {
  label: string;
  value: string;
  tone?: "danger";
  title?: string;
};

export function CompactSummary({
  ariaLabel,
  items,
  statusMessages = [],
}: {
  ariaLabel: string;
  items: readonly SummaryItem[];
  statusMessages?: readonly string[];
}) {
  const hasStatusMessages = statusMessages.length > 0;

  return (
    <dl className={`compact-summary${hasStatusMessages ? " has-summary-alert" : ""}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <div
          className={`summary-metric${item.tone ? ` ${item.tone}` : ""}`}
          key={item.label}
          title={item.title}
          aria-invalid={item.tone === "danger" ? true : undefined}
        >
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
      {hasStatusMessages ? (
        <div className="summary-alert" role="status" aria-live="polite">
          <p>
            {statusMessages[0]}
            {statusMessages.length > 1 ? " 他" : ""}
          </p>
        </div>
      ) : null}
    </dl>
  );
}
