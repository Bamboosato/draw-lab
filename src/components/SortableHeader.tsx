type SortDirection = "asc" | "desc";

type SortState<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};

export function SortableHeader<TKey extends string>({
  label,
  sortKey,
  sort,
  ascendingLabel,
  descendingLabel,
  onSort,
  getNextSort,
}: {
  label: string;
  sortKey: TKey;
  sort: SortState<TKey>;
  ascendingLabel: string;
  descendingLabel: string;
  onSort: (sort: SortState<TKey>) => void;
  getNextSort: (sort: SortState<TKey>, key: TKey) => SortState<TKey>;
}) {
  const active = sort.key === sortKey;
  const nextSort = getNextSort(sort, sortKey);
  const nextDirectionLabel = nextSort.direction === "asc" ? ascendingLabel : descendingLabel;
  const sortLabel = `${label}を${nextDirectionLabel}に並び替え`;
  const icon = active ? (sort.direction === "asc" ? "▲" : "▼") : "⇅";

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="table-sort-button"
        title={sortLabel}
        aria-label={sortLabel}
        onClick={() => onSort(nextSort)}
      >
        <span>{label}</span>
        <span className={`table-sort-icon${active ? " active" : ""}`} aria-hidden="true">{icon}</span>
      </button>
    </th>
  );
}
