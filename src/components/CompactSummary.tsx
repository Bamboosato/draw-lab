type SummaryItem = {
  label: string;
  value: string;
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
        <div className="summary-metric" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
