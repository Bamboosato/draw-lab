import { useEffect } from "react";
import { buildLeagueMatrixPrintPages } from "../domain/leaguePrint";
import type { League } from "../domain/leagueTypes";

const LEAGUE_PRINT_ROW_COLUMN_WIDTH_MM = 34;
const LEAGUE_PRINT_RESULT_COLUMN_WIDTH_MM = 19.5;

export function LeagueMatrixPrintDocument({ league, groupId }: { league: League; groupId: string }) {
  const { pages } = buildLeagueMatrixPrintPages(league, groupId);

  useEffect(() => {
    if (pages.length === 0) return undefined;

    document.body.classList.add("league-matrix-print-mode");
    return () => document.body.classList.remove("league-matrix-print-mode");
  }, [pages.length]);

  if (pages.length === 0) return null;

  return (
    <div className="league-matrix-print-document" aria-hidden="true">
      {pages.map((page) => (
        <section
          className={`league-matrix-print-page${page.pageCount > 1 ? " has-split-columns" : ""}`}
          key={`${page.groupId}-${page.pageNumber}`}
        >
          <header className="league-matrix-print-heading">
            <div>
              <h1>{league.title || "リーグ表"}</h1>
              <p>{[league.eventName, league.date, league.venue].filter(Boolean).join(" ／ ")}</p>
            </div>
            <div className="league-matrix-print-page-meta">
              <strong>{page.groupName}</strong>
              <span>{page.pageNumber} / {page.pageCount}</span>
            </div>
          </header>
          <table
            className="league-matrix-print-table"
            style={page.pageCount > 1 ? { width: `${getSplitPageTableWidth(page.columns.length)}mm` } : undefined}
          >
            <colgroup>
              <col
                className="league-matrix-print-row-column"
                style={page.pageCount > 1 ? { width: `${LEAGUE_PRINT_ROW_COLUMN_WIDTH_MM}mm` } : undefined}
              />
              {page.columns.map((column) => (
                <col
                  className="league-matrix-print-result-column"
                  key={column.id}
                  style={page.pageCount > 1 ? { width: `${LEAGUE_PRINT_RESULT_COLUMN_WIDTH_MM}mm` } : undefined}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">参加者</th>
                {page.columns.map((column) => (
                  <th scope="col" key={column.id}>
                    <span>{column.displayName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.participant.id}>
                  <th scope="row">{row.participant.fullLabel}</th>
                  {row.cells.map((cell) => (
                    <td className={cell.isDiagonal ? "is-diagonal" : undefined} key={cell.participantId}>
                      {cell.isDiagonal ? <DiagonalLine /> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function getSplitPageTableWidth(columnCount: number): number {
  return LEAGUE_PRINT_ROW_COLUMN_WIDTH_MM + columnCount * LEAGUE_PRINT_RESULT_COLUMN_WIDTH_MM;
}

function DiagonalLine() {
  return (
    <svg className="league-matrix-print-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
      <line x1="0" y1="0" x2="100" y2="100" />
    </svg>
  );
}
