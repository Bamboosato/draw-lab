import type { CSSProperties } from "react";
import type { BracketViewModel } from "../domain/types";

const slotHeight = 44;
const slotGap = 8;

export function DrawPreview({ viewModel, randomSeed, generatedAt }: {
  viewModel: BracketViewModel;
  randomSeed: string;
  generatedAt: string;
}) {
  const roundCount = Math.log2(viewModel.drawSize);
  const rounds = Array.from({ length: roundCount }, (_, index) => index + 1);

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
          <span>Seed: {randomSeed}</span>
          <span>{formatDateTime(generatedAt)}</span>
        </div>
      </div>
      <div className="bracket-scroll">
        <div
          className="bracket-grid"
          style={{
            "--slot-height": `${slotHeight}px`,
            "--slot-gap": `${slotGap}px`,
            gridTemplateColumns: `minmax(280px, 340px) repeat(${roundCount}, minmax(160px, 190px))`,
          } as CSSProperties}
        >
          <section className="bracket-round entrant-round">
            <h3>出場者</h3>
            {viewModel.rows.map((row) => (
              <div className={`entrant-slot ${row.isBye ? "bye" : ""}`} key={row.position}>
                <span className="slot-position">{row.position}</span>
                {row.seedNo ? <span className="seed-chip">S{row.seedNo}</span> : <span className="seed-spacer" />}
                <span className="entrant-name">{row.label || "未配置"}</span>
                <span className="entrant-sub">
                  {[row.teamLabel, row.region].filter(Boolean).join(" / ") || "-"}
                </span>
              </div>
            ))}
          </section>
          {rounds.map((round) => (
            <section className="bracket-round match-round" key={round}>
              <h3>{getRoundName(round, roundCount)}</h3>
              {Array.from({ length: viewModel.drawSize / 2 ** round }, (_, index) => {
                const span = 2 ** round;
                const height = span * slotHeight + Math.max(0, span - 1) * slotGap;

                return (
                  <div
                    className="match-box"
                    key={`${round}-${index}`}
                    style={{ minHeight: `${height}px` }}
                  >
                    <span>{round === roundCount ? "優勝" : `勝者 M${round}-${index + 1}`}</span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
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
