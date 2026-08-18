type SummaryItem = {
  label: string;
  value: string;
  tone?: "danger";
  title?: string;
};

export function CompactSummary({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: readonly SummaryItem[];
}) {
  return (
    <dl className="compact-summary" aria-label={ariaLabel}>
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
    </dl>
  );
}
