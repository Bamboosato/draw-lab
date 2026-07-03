import type { BracketViewModel } from "../domain/types";

const slotWidth = 330;
const slotHeight = 44;
const slotGap = 10;
const roundGap = 176;
const resultWidth = 128;
const resultHeight = 34;
const connectorOffset = 28;
const connectorOverlap = 8;
const leftPadding = 16;
const topPadding = 42;
const rightPadding = 28;
const bottomPadding = 24;
const entrantNameX = leftPadding + 96;

export function DrawPreview({
  viewModel,
  generatedAt,
}: {
  viewModel: BracketViewModel;
  generatedAt: string;
}) {
  const roundCount = Math.log2(viewModel.drawSize);
  const rounds = Array.from({ length: roundCount }, (_, index) => index + 1);
  const rowPitch = slotHeight + slotGap;
  const svgWidth = leftPadding + slotWidth + connectorOffset + roundGap * (roundCount - 1) + resultWidth + rightPadding;
  const svgHeight = topPadding + viewModel.rows.length * rowPitch - slotGap + bottomPadding;

  const rowCenterY = (rowIndex: number): number => topPadding + rowIndex * rowPitch + slotHeight / 2;
  const roundX = (round: number): number => leftPadding + slotWidth + connectorOffset + roundGap * (round - 1);
  const sourceX = (round: number): number => round === 1 ? leftPadding + slotWidth : roundX(round - 1) + resultWidth;
  const matchCenterY = (round: number, matchIndex: number): number => {
    const span = 2 ** round;
    const startRow = matchIndex * span;
    const endRow = startRow + span - 1;
    return (rowCenterY(startRow) + rowCenterY(endRow)) / 2;
  };

  return (
    <section className="print-page draw-preview">
      <div className="draw-sheet-heading">
        <div>
          <h2>{viewModel.title || "無題のトーナメント"}</h2>
          <p>
            {viewModel.date ? `開催日: ${viewModel.date}` : "開催日: 未設定"}
            {viewModel.venue ? ` | 会場: ${viewModel.venue}` : ""}
            {viewModel.eventName ? ` | 種目: ${viewModel.eventName}` : ""}
          </p>
        </div>
        <div className="draw-meta">
          <span>{viewModel.drawSize}ドロー</span>
          <span>{formatDateTime(generatedAt)}</span>
        </div>
      </div>
      <div className="bracket-scroll">
        <svg
          className="svg-bracket"
          role="img"
          aria-label={`${viewModel.title || "トーナメント"}のトーナメント表`}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
        >
          <text className="svg-round-heading" x={leftPadding} y={22}>出場者</text>
          {rounds.map((round) => (
            <text className="svg-round-heading" x={roundX(round)} y={22} key={`heading-${round}`}>
              {getRoundName(round, roundCount)}
            </text>
          ))}

          <g className="svg-connectors">
            {rounds.flatMap((round) => {
              const matchCount = viewModel.drawSize / 2 ** round;
              const x = roundX(round);
              const previousX = sourceX(round);
              const connectorX = round === 1 ? previousX + connectorOffset / 2 : x - connectorOffset;

              return Array.from({ length: matchCount }, (_, matchIndex) => {
                const topY = round === 1 ? rowCenterY(matchIndex * 2) : matchCenterY(round - 1, matchIndex * 2);
                const bottomY = round === 1 ? rowCenterY(matchIndex * 2 + 1) : matchCenterY(round - 1, matchIndex * 2 + 1);
                const centerY = (topY + bottomY) / 2;

                return (
                  <path
                    className="svg-connector"
                    key={`connector-${round}-${matchIndex}`}
                    d={`M ${previousX - connectorOverlap} ${topY} H ${connectorX} V ${bottomY} H ${previousX - connectorOverlap} M ${connectorX} ${centerY} H ${x + connectorOverlap}`}
                  />
                );
              });
            })}
          </g>

          {viewModel.rows.map((row, index) => {
            const y = topPadding + index * rowPitch;

            return (
              <g className={`svg-slot ${row.isBye ? "bye" : ""}`} key={row.position}>
                <rect x={leftPadding} y={y} width={slotWidth} height={slotHeight} rx={6} />
                <text className="svg-slot-position" x={leftPadding + 12} y={y + 27}>{row.position}</text>
                {row.seedNo ? (
                  <g>
                    <rect className="svg-seed-chip" x={leftPadding + 46} y={y + 10} width={38} height={22} rx={11} />
                    <text className="svg-seed-text" x={leftPadding + 65} y={y + 25}>S{row.seedNo}</text>
                  </g>
                ) : null}
                <text className="svg-entrant-name" x={entrantNameX} y={y + 18}>
                  {truncateText(row.label || "未配置", 21)}
                </text>
                <text className="svg-entrant-sub" x={entrantNameX} y={y + 36}>
                  {truncateText([row.teamLabel, row.region].filter(Boolean).join(" / ") || "-", 26)}
                </text>
              </g>
            );
          })}

          {rounds.flatMap((round) => {
            const matchCount = viewModel.drawSize / 2 ** round;
            const x = roundX(round);

            return Array.from({ length: matchCount }, (_, matchIndex) => {
              const centerY = matchCenterY(round, matchIndex);
              const label = round === roundCount ? "優勝" : `勝者 M${round}-${matchIndex + 1}`;

              return (
                <g className="svg-match" key={`match-${round}-${matchIndex}`}>
                  <rect x={x} y={centerY - resultHeight / 2} width={resultWidth} height={resultHeight} rx={6} />
                  <text x={x + 12} y={centerY + 5}>{label}</text>
                </g>
              );
            });
          })}
        </svg>
      </div>
    </section>
  );
}

function getRoundName(round: number, roundCount: number): string {
  const remaining = roundCount - round;

  if (remaining === 0) {
    return "決勝";
  }

  if (remaining === 1) {
    return "準決勝";
  }

  if (remaining === 2) {
    return "準々決勝";
  }

  return `${round}回戦`;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
