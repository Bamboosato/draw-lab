import type {
  BracketRow,
  BracketScoreDisplay,
  BracketViewModel,
  DrawOutputOptions,
  DrawSize,
  ResolvedTournamentMatch,
} from "../domain/types";
import type { ReactNode } from "react";
import { getEffectiveOutputPageCount } from "../domain/outputOptions";

const singleSlotHeight = 44;
const doublesSlotHeight = 58;
const slotGap = 10;
const connectorLength = 24;
const roundGap = connectorLength;
const connectorOffset = roundGap;
const leftPadding = 16;
const topPadding = 20;
const rightPadding = 28;
const bottomPadding = 24;
const slotHorizontalPadding = 12;
const drawNumberZoneWidth = 20;
const seedChipWidth = 38;
const controlGap = 8;
const minSinglesSlotWidth = 210;
const maxSinglesSlotWidth = 260;
const minDoublesSlotWidth = 240;
const maxDoublesSlotWidth = 280;
const entrantFontSize = 13;
const teamFontSize = 11;
const doublesColumnGap = 8;
const minDoublesPlayerWidth = 44;
const minDoublesTeamWidth = 36;
const maxDoublesTeamWidth = 84;
const centerGap = connectorLength * 2;

type TextLayout = {
  x: number;
  textAnchor: "start" | "middle";
  textLength?: number;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
};

export function getDistributedTextLayout(
  value: string,
  startX: number,
  availableWidth: number,
  fontSize: number,
): TextLayout {
  const characterCount = Array.from(value).length;
  const naturalWidth = estimateTextWidth(value, fontSize);
  const safeWidth = Math.max(0, availableWidth);

  if (characterCount < 2 || safeWidth <= 0) {
    return { x: startX, textAnchor: "start" };
  }

  const maxWidth = naturalWidth + (characterCount - 1) * fontSize;
  const targetWidth = Math.min(safeWidth, maxWidth);

  if (targetWidth <= 0) {
    return { x: startX, textAnchor: "start" };
  }

  return {
    x: startX,
    textAnchor: "start",
    textLength: targetWidth,
    lengthAdjust: targetWidth < naturalWidth ? "spacingAndGlyphs" : "spacing",
  };
}

type SlotSide = "single" | "left" | "right";

type SlotContentLayout = {
  drawNumberX: number;
  drawNumberAnchor: "start" | "end";
  seedX: number;
  seedOnLeft: boolean;
  content: { startX: number; endX: number };
};

export function getSlotContentLayout(
  slotX: number,
  slotWidth: number,
  side: SlotSide,
  outputOptions: Pick<DrawOutputOptions, "rightSideDrawNumberPosition" | "seedNumberPosition">,
  reserveSeed: boolean,
): SlotContentLayout {
  const drawNumberOnRight = side === "right" && outputOptions.rightSideDrawNumberPosition === "right";
  const seedOnLeft = isSeedOnLeft(side, outputOptions.seedNumberPosition);
  let contentStartX = slotX + slotHorizontalPadding;
  let contentEndX = slotX + slotWidth - slotHorizontalPadding;
  const drawNumberX = drawNumberOnRight ? contentEndX : contentStartX;

  if (drawNumberOnRight) {
    contentEndX -= drawNumberZoneWidth;
  } else {
    contentStartX += drawNumberZoneWidth;
  }

  let seedX = seedOnLeft ? contentStartX : contentEndX - seedChipWidth;
  if (reserveSeed) {
    if (seedOnLeft) {
      seedX = contentStartX;
      contentStartX += seedChipWidth + controlGap;
    } else {
      seedX = contentEndX - seedChipWidth;
      contentEndX -= seedChipWidth + controlGap;
    }
  }

  return {
    drawNumberX,
    drawNumberAnchor: drawNumberOnRight ? "end" : "start",
    seedX,
    seedOnLeft,
    content: { startX: contentStartX, endX: contentEndX },
  };
}

export function isSeedOnLeft(
  side: "single" | "left" | "right",
  seedNumberPosition: DrawOutputOptions["seedNumberPosition"],
): boolean {
  return side === "right"
    ? seedNumberPosition === "inner"
    : seedNumberPosition === "outer";
}

export function getBothSideJoinCenterY(drawSize: number, slotHeight = singleSlotHeight): number {
  const sideRowCount = drawSize / 2;
  const firstRowCenterY = topPadding + slotHeight / 2;
  const lastRowCenterY = topPadding + (sideRowCount - 1) * (slotHeight + slotGap) + slotHeight / 2;

  return (firstRowCenterY + lastRowCenterY) / 2;
}

export function getBothSideJoinPath(
  leftSourceX: number,
  rightSourceX: number,
  centerY: number,
): string {
  const centerX = (leftSourceX + rightSourceX) / 2;
  return `M ${leftSourceX} ${centerY} H ${rightSourceX} M ${centerX} ${centerY} V ${centerY - connectorLength}`;
}

export function getRoundConnectorPath(
  sourceX: number,
  targetX: number,
  topY: number,
  bottomY: number,
): string {
  return `M ${sourceX} ${topY} H ${targetX} V ${bottomY} H ${sourceX}`;
}

export function getSingleSideFinalConnectorPath(targetX: number, centerY: number): string {
  return `M ${targetX} ${centerY} H ${targetX + connectorLength}`;
}

export function getBothSideRowGroups(
  rows: BracketRow[],
  drawSize: number,
): { leftRows: BracketRow[]; rightRows: BracketRow[] } {
  const sideRowCount = drawSize / 2;
  return {
    leftRows: rows.slice(0, sideRowCount),
    rightRows: rows.slice(sideRowCount),
  };
}

export type PrintPageBracket = {
  drawSize: DrawSize;
  rows: BracketRow[];
};

export function getPrintPageBrackets(
  rows: BracketRow[],
  drawSize: DrawSize,
  pageCount: number,
): PrintPageBracket[] {
  const safePageCount = pageCount > 0
    && drawSize % pageCount === 0
    && drawSize / pageCount >= 4
    ? pageCount
    : 1;
  const pageDrawSize = drawSize / safePageCount as DrawSize;

  return Array.from({ length: safePageCount }, (_, index) => ({
    drawSize: pageDrawSize,
    rows: rows.slice(index * pageDrawSize, (index + 1) * pageDrawSize),
  }));
}

export function getPrintPageMatches(
  matches: readonly ResolvedTournamentMatch[],
  pageDrawSize: DrawSize,
  pageIndex: number,
): ResolvedTournamentMatch[] {
  const pageStartPosition = pageIndex * pageDrawSize + 1;
  const pageRoundCount = Math.log2(pageDrawSize);

  return Array.from({ length: pageRoundCount }, (_, roundIndex) => roundIndex + 1)
    .flatMap((round) => {
      const matchCount = pageDrawSize / 2 ** round;
      return Array.from({ length: matchCount }, (_, localMatchIndex) => {
        const localMatchNo = localMatchIndex + 1;
        const sourcePosition = pageStartPosition + localMatchIndex * 2 ** round;
        const globalMatchNo = Math.floor((sourcePosition - 1) / 2 ** round) + 1;
        const match = matches.find((candidate) => candidate.round === round && candidate.matchNo === globalMatchNo);
        return match ? { ...match, round, matchNo: localMatchNo } : undefined;
      }).filter((match): match is ResolvedTournamentMatch => match !== undefined);
    });
}

export function getPrintPageScoreDisplays(
  scoreDisplays: readonly BracketScoreDisplay[],
  pageMatches: readonly ResolvedTournamentMatch[],
): BracketScoreDisplay[] {
  const pageMatchIds = new Set(pageMatches.map((match) => match.id));
  return scoreDisplays.filter((scoreDisplay) => pageMatchIds.has(scoreDisplay.matchId));
}

export function getColumnTextLayout(
  value: string,
  startX: number,
  endX: number,
  textAlign: DrawOutputOptions["textAlign"],
  fontSize: number,
): TextLayout {
  const availableWidth = Math.max(0, endX - startX);
  const needsCompression = availableWidth > 0 && estimateTextWidth(value, fontSize) > availableWidth;
  const fitLayout = needsCompression
    ? { textLength: availableWidth, lengthAdjust: "spacingAndGlyphs" as const }
    : {};

  if (textAlign === "distributed") {
    return getDistributedTextLayout(value, startX, endX - startX, fontSize);
  }

  return {
    x: textAlign === "center" ? (startX + endX) / 2 : startX,
    textAnchor: textAlign === "center" ? "middle" : "start",
    ...fitLayout,
  };
}

function getDoublesColumnRanges(
  textRange: { startX: number; endX: number },
  desiredTeamWidth: number,
): {
  player: { startX: number; endX: number };
  team: { startX: number; endX: number };
} {
  const availableWidth = Math.max(0, textRange.endX - textRange.startX);
  const teamWidth = desiredTeamWidth > 0
    ? Math.min(desiredTeamWidth, Math.max(0, availableWidth - minDoublesPlayerWidth - doublesColumnGap))
    : 0;
  const columnGap = teamWidth > 0 ? doublesColumnGap : 0;
  const playerEndX = Math.max(textRange.startX, textRange.endX - teamWidth - columnGap);

  return {
    player: { startX: textRange.startX, endX: playerEndX },
    team: { startX: playerEndX + columnGap, endX: textRange.endX },
  };
}

function estimateTextWidth(value: string, fontSize: number): number {
  return Array.from(value).reduce((width, character) => {
    if (/\s/.test(character)) {
      return width + fontSize * 0.4;
    }

    if (/^[\u0000-\u007f]$/.test(character)) {
      return width + fontSize * 0.62;
    }

    return width + fontSize;
  }, 0);
}

function getDoublesTeamColumnWidth(rows: BracketRow[]): number {
  const labels = rows.flatMap((row) => [row.team1Label, row.team2Label]).filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    return 0;
  }

  const requiredWidth = Math.max(...labels.map((label) => estimateTextWidth(truncateText(label, 12), teamFontSize))) + 4;
  return clamp(Math.ceil(requiredWidth), minDoublesTeamWidth, maxDoublesTeamWidth);
}

export function getSlotWidth(viewModel: BracketViewModel): number {
  const reserveSeed = viewModel.rows.some((row) => row.seedNo !== undefined);
  const controlWidth = slotHorizontalPadding * 2
    + drawNumberZoneWidth
    + (reserveSeed ? seedChipWidth + controlGap : 0);

  if (viewModel.matchType === "doubles") {
    const playerLabels = viewModel.rows
      .flatMap((row) => [row.player1Label, row.player2Label])
      .filter((label): label is string => Boolean(label));
    const playerRequiredWidth = playerLabels.length > 0
      ? Math.max(...playerLabels.map((label) => estimateTextWidth(truncateText(label, 14), entrantFontSize))) + 6
      : minDoublesPlayerWidth;
    const playerWidth = clamp(Math.ceil(playerRequiredWidth), 64, 132);
    const teamWidth = getDoublesTeamColumnWidth(viewModel.rows);
    const contentWidth = playerWidth + (teamWidth > 0 ? doublesColumnGap + teamWidth : 0);

    return clamp(Math.ceil(contentWidth + controlWidth), minDoublesSlotWidth, maxDoublesSlotWidth);
  }

  const requiredWidths = viewModel.rows.flatMap((row) => [
    estimateTextWidth(truncateText(row.label || "未配置", 21), entrantFontSize),
    estimateTextWidth(truncateText(row.teamLabel || "-", 26), teamFontSize),
  ]);
  const contentWidth = clamp(Math.ceil(Math.max(...requiredWidths, 0) + 8), 96, 170);

  return clamp(contentWidth + controlWidth, minSinglesSlotWidth, maxSinglesSlotWidth);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function DrawPreview({
  viewModel,
  generatedAt,
  renderMode = "full",
  pageNumber,
}: {
  viewModel: BracketViewModel;
  generatedAt: string;
  renderMode?: "full" | "canvas";
  pageNumber?: number;
}) {
  const roundCount = Math.log2(viewModel.drawSize);
  const bothSides = viewModel.outputOptions.bracketLayout === "bothSides";
  const doubles = viewModel.matchType === "doubles";
  const slotWidth = getSlotWidth(viewModel);
  const reserveSeed = viewModel.rows.some((row) => row.seedNo !== undefined);
  const doublesTeamColumnWidth = doubles ? getDoublesTeamColumnWidth(viewModel.rows) : 0;
  const slotHeight = doubles ? doublesSlotHeight : singleSlotHeight;
  const visibleRowCount = bothSides ? viewModel.drawSize / 2 : viewModel.drawSize;
  const rowPitch = slotHeight + slotGap;
  const sideTrackWidth = slotWidth + connectorOffset + roundGap * Math.max(roundCount - 2, 0);
  const svgWidth = bothSides
    ? leftPadding + sideTrackWidth + centerGap + sideTrackWidth + rightPadding
    : leftPadding + slotWidth + connectorOffset + roundGap * (roundCount - 1) + rightPadding;
  const svgHeight = topPadding + visibleRowCount * rowPitch - slotGap + bottomPadding;
  const rounds = Array.from({ length: roundCount }, (_, index) => index + 1);
  const sideRounds = Array.from({ length: Math.max(roundCount - 1, 1) }, (_, index) => index + 1);
  const rowCenterY = (rowIndex: number): number => topPadding + rowIndex * rowPitch + slotHeight / 2;
  const leftBaseX = leftPadding;
  const rightBaseX = svgWidth - rightPadding - slotWidth;
  const leftRoundX = (round: number): number => leftBaseX + slotWidth + connectorOffset + roundGap * (round - 1);
  const rightRoundX = (round: number): number => rightBaseX - connectorOffset - roundGap * (round - 1);
  const connectorStrokeWidth = getLineWidth(viewModel.outputOptions.lineWeight);
  const winnerStrokeWidth = Math.max(connectorStrokeWidth + 1.5, 3.25);
  const matches = viewModel.matches ?? [];
  const matchByRoundAndNo = (round: number, matchNo: number) => matches.find(
    (match) => match.round === round && match.matchNo === matchNo,
  );

  const matchCenterY = (round: number, matchIndex: number, side: "single" | "left" | "right"): number => {
    const rowCount = side === "single" ? viewModel.drawSize : viewModel.drawSize / 2;
    const span = 2 ** round;
    const startRow = matchIndex * span;
    const endRow = startRow + span - 1;
    return (rowCenterY(startRow) + rowCenterY(Math.min(endRow, rowCount - 1))) / 2;
  };

  type MatchBranchGeometry = {
    sourceX: number;
    targetX: number;
    topY: number;
    bottomY: number;
    isLeft: boolean;
  };

  const getMatchBranchGeometry = (
    side: "single" | "left" | "right",
    round: number,
    localMatchIndex: number,
  ): MatchBranchGeometry => {
    const isLeft = side !== "right";
    const sourceX = round === 1
      ? (isLeft ? leftBaseX + slotWidth : rightBaseX)
      : (isLeft ? leftRoundX(round - 1) : rightRoundX(round - 1));
    const targetX = isLeft ? leftRoundX(round) : rightRoundX(round);

    return {
      sourceX,
      targetX,
      topY: round === 1
        ? rowCenterY(localMatchIndex * 2)
        : matchCenterY(round - 1, localMatchIndex * 2, side),
      bottomY: round === 1
        ? rowCenterY(localMatchIndex * 2 + 1)
        : matchCenterY(round - 1, localMatchIndex * 2 + 1, side),
      isLeft,
    };
  };

  const getMatchCount = (side: "single" | "left" | "right", round: number): number => (
    side === "single"
      ? viewModel.drawSize / 2 ** round
      : viewModel.drawSize / 2 / 2 ** round
  );

  const renderSlot = (row: BracketRow, index: number, side: "single" | "left" | "right") => {
    const slotX = side === "right" ? rightBaseX : leftBaseX;
    const y = topPadding + index * rowPitch;
    const slotLayout = getSlotContentLayout(
      slotX,
      slotWidth,
      side,
      viewModel.outputOptions,
      reserveSeed,
    );
    const textRange = slotLayout.content;
    const name = truncateText(row.label || "未配置", 21);
    const sub = truncateText(row.teamLabel || "-", 26);
    const nameLayout = getColumnTextLayout(
      name,
      textRange.startX,
      textRange.endX,
      viewModel.outputOptions.textAlign,
      entrantFontSize,
    );
    const subLayout = getColumnTextLayout(
      sub,
      textRange.startX,
      textRange.endX,
      viewModel.outputOptions.textAlign,
      teamFontSize,
    );
    const doublesColumnRanges = doubles
      ? getDoublesColumnRanges(textRange, doublesTeamColumnWidth)
      : undefined;
    const isDoublesEntrant = doubles && !row.isBye && Boolean(row.player1Label || row.player2Label);

    return (
      <g className={`svg-slot ${row.isBye ? "bye" : ""}`} key={`${side}-${row.position}`}>
        <rect x={slotX} y={y} width={slotWidth} height={slotHeight} rx={6} />
        <text
          className="svg-slot-position"
          x={slotLayout.drawNumberX}
          y={y + 27}
          textAnchor={slotLayout.drawNumberAnchor}
        >
          {row.position}
        </text>
        {row.seedNo ? (
          <g>
            <rect className="svg-seed-chip" x={slotLayout.seedX} y={y + 10} width={seedChipWidth} height={22} rx={11} />
            <text className="svg-seed-text" x={slotLayout.seedX + seedChipWidth / 2} y={y + 25}>S{row.seedNo}</text>
          </g>
        ) : null}
        {isDoublesEntrant && doublesColumnRanges ? (
          <>
            <text
              className="svg-entrant-name"
              y={y + 20}
              {...getColumnTextLayout(
                truncateText(row.player1Label || "未配置", 14),
                doublesColumnRanges.player.startX,
                doublesColumnRanges.player.endX,
                viewModel.outputOptions.textAlign,
                entrantFontSize,
              )}
            >
              {truncateText(row.player1Label || "未配置", 14)}
            </text>
            {row.player2Label ? (
              <text
                className="svg-entrant-name"
                y={y + 40}
                {...getColumnTextLayout(
                  truncateText(row.player2Label, 14),
                  doublesColumnRanges.player.startX,
                  doublesColumnRanges.player.endX,
                  viewModel.outputOptions.textAlign,
                  entrantFontSize,
                )}
              >
                {truncateText(row.player2Label, 14)}
              </text>
            ) : null}
            {row.team1Label ? (
              <text
                className="svg-entrant-team"
                y={row.team2Label ? y + 20 : y + 30}
                {...getColumnTextLayout(
                  truncateText(row.team1Label, 12),
                  doublesColumnRanges.team.startX,
                  doublesColumnRanges.team.endX,
                  viewModel.outputOptions.textAlign,
                  teamFontSize,
                )}
              >
                {truncateText(row.team1Label, 12)}
              </text>
            ) : null}
            {row.team2Label ? (
              <text
                className="svg-entrant-team"
                y={y + 40}
                {...getColumnTextLayout(
                  truncateText(row.team2Label, 12),
                  doublesColumnRanges.team.startX,
                  doublesColumnRanges.team.endX,
                  viewModel.outputOptions.textAlign,
                  teamFontSize,
                )}
              >
                {truncateText(row.team2Label, 12)}
              </text>
            ) : null}
          </>
        ) : (
          <>
            <text className="svg-entrant-name" y={y + 18} {...nameLayout}>
              {name}
            </text>
            <text className="svg-entrant-sub" y={y + 36} {...subLayout}>
              {sub}
            </text>
          </>
        )}
      </g>
    );
  };

  const renderConnectors = (side: "single" | "left" | "right", connectorRounds: number[]) => (
    connectorRounds.flatMap((round) => {
      const matchCount = getMatchCount(side, round);

      return Array.from({ length: matchCount }, (_, matchIndex) => {
        const geometry = getMatchBranchGeometry(side, round, matchIndex);

        return (
          <path
            className="svg-connector"
            key={`connector-${side}-${round}-${matchIndex}`}
            style={{ strokeWidth: connectorStrokeWidth }}
            d={getRoundConnectorPath(geometry.sourceX, geometry.targetX, geometry.topY, geometry.bottomY)}
          />
        );
      });
    })
  );

  const getWinnerSide = (match: (typeof matches)[number]): "A" | "B" | undefined => {
    if (!match.winnerEntrantId) {
      return undefined;
    }
    return match.winnerEntrantId === match.participantAId ? "A" : "B";
  };

  const getWinnerBranchPath = (
    sourceX: number,
    targetX: number,
    topY: number,
    bottomY: number,
    winnerSide: "A" | "B",
    nextTargetX?: number,
  ): string => {
    const centerY = (topY + bottomY) / 2;
    const sourceY = winnerSide === "A" ? topY : bottomY;
    return `M ${sourceX} ${sourceY} H ${targetX} V ${centerY}${nextTargetX === undefined ? "" : ` H ${nextTargetX}`}`;
  };

  const renderWinnerConnectors = (side: "single" | "left" | "right", connectorRounds: number[]) => (
    connectorRounds.flatMap((round) => {
      const matchCount = getMatchCount(side, round);
      const sideMatchOffset = side === "right" ? matchCount : 0;

      return Array.from({ length: matchCount }, (_, localMatchIndex) => {
        const logicalMatchNo = sideMatchOffset + localMatchIndex + 1;
        const match = matchByRoundAndNo(round, logicalMatchNo);
        const winnerSide = match ? getWinnerSide(match) : undefined;
        if (!match || !winnerSide) {
          return null;
        }
        const geometry = getMatchBranchGeometry(side, round, localMatchIndex);

        return (
          <path
            className="svg-connector winner"
            key={`winner-connector-${side}-${round}-${localMatchIndex}`}
            style={{ strokeWidth: winnerStrokeWidth }}
            d={getWinnerBranchPath(
              geometry.sourceX,
              geometry.targetX,
              geometry.topY,
              geometry.bottomY,
              winnerSide,
              round < (side === "single" ? roundCount : sideRounds[sideRounds.length - 1] ?? round)
                ? (geometry.isLeft ? leftRoundX(round + 1) : rightRoundX(round + 1))
                : undefined,
            )}
          />
        );
      }).filter(Boolean);
    })
  );

  const renderScoreDisplays = () => {
    const scoreElements: ReactNode[] = [];
    const finalCenterY = getBothSideJoinCenterY(viewModel.drawSize, slotHeight);
    const leftFinalSourceX = leftRoundX(sideRounds[sideRounds.length - 1] ?? 1);
    const rightFinalSourceX = rightRoundX(sideRounds[sideRounds.length - 1] ?? 1);
    const centerFinalX = (leftFinalSourceX + rightFinalSourceX) / 2;

    for (const scoreDisplay of viewModel.scoreDisplays ?? []) {
      const match = matches.find((candidate) => candidate.id === scoreDisplay.matchId);
      if (!match) {
        continue;
      }

      const renderWinnerLoserScore = (x: number, y: number, key: string) => (
        <text className="svg-score svg-score-winner-loser" key={key} x={x} y={y} textAnchor="middle">
          {scoreDisplay.winnerValue}-{scoreDisplay.loserValue}
        </text>
      );
      const renderWalkover = (x: number, y: number, key: string) => (
        <text className="svg-score svg-score-walkover" key={key} x={x} y={y} textAnchor="middle">
          WO
        </text>
      );
      const renderParticipantSetScores = (
        participantAX: number,
        participantBX: number,
        participantAY: number,
        participantBY: number,
        key: string,
      ) => (
        <g className="svg-score-set-wins" key={key}>
          <text className="svg-score svg-score-participant-a" x={participantAX} y={participantAY} textAnchor="middle">
            {scoreDisplay.participantAValue}
          </text>
          <text className="svg-score svg-score-participant-b" x={participantBX} y={participantBY} textAnchor="middle">
            {scoreDisplay.participantBValue}
          </text>
        </g>
      );

      if (bothSides && match.round === roundCount) {
        if (scoreDisplay.mode === "walkover" || scoreDisplay.mode === "winner-loser-games") {
          const winnerIsA = match.winnerEntrantId === match.participantAId;
          const sourceX = winnerIsA ? leftFinalSourceX : rightFinalSourceX;
          scoreElements.push(scoreDisplay.mode === "walkover"
            ? renderWalkover((sourceX + centerFinalX) / 2, finalCenterY - 7, `score-${scoreDisplay.matchId}`)
            : renderWinnerLoserScore((sourceX + centerFinalX) / 2, finalCenterY - 7, `score-${scoreDisplay.matchId}`));
        } else {
          scoreElements.push(renderParticipantSetScores(
            (leftFinalSourceX + centerFinalX) / 2,
            (rightFinalSourceX + centerFinalX) / 2,
            finalCenterY - 7,
            finalCenterY - 7,
            `score-${scoreDisplay.matchId}`,
          ));
        }
        continue;
      }

      const side: "single" | "left" | "right" = bothSides
        ? match.matchNo > getMatchCount("right", match.round) ? "right" : "left"
        : "single";
      const matchCount = getMatchCount(side, match.round);
      const sideMatchOffset = side === "right" ? matchCount : 0;
      const localMatchIndex = match.matchNo - sideMatchOffset - 1;
      if (localMatchIndex < 0 || localMatchIndex >= matchCount) {
        continue;
      }
      const geometry = getMatchBranchGeometry(side, match.round, localMatchIndex);
      const sourceY = (winner: "A" | "B") => winner === "A" ? geometry.topY : geometry.bottomY;
      const scoreX = (geometry.sourceX + geometry.targetX) / 2;

      if (scoreDisplay.mode === "walkover" || scoreDisplay.mode === "winner-loser-games") {
        const winnerSide = getWinnerSide(match);
        if (!winnerSide) {
          continue;
        }
        scoreElements.push(scoreDisplay.mode === "walkover"
          ? renderWalkover(scoreX, sourceY(winnerSide) - 7, `score-${scoreDisplay.matchId}`)
          : renderWinnerLoserScore(scoreX, sourceY(winnerSide) - 7, `score-${scoreDisplay.matchId}`));
      } else {
        scoreElements.push(renderParticipantSetScores(
          scoreX,
          scoreX,
          geometry.topY - 7,
          geometry.bottomY - 7,
          `score-${scoreDisplay.matchId}`,
        ));
      }
    }

    return scoreElements;
  };

  const renderBothSideFinalConnector = () => {
    const lastSideRound = sideRounds[sideRounds.length - 1];
    const finalCenterY = getBothSideJoinCenterY(viewModel.drawSize, slotHeight);
    const leftSourceX = leftRoundX(lastSideRound);
    const rightSourceX = rightRoundX(lastSideRound);

    return (
      <path
        className="svg-connector svg-final-connector"
        style={{ strokeWidth: connectorStrokeWidth }}
        d={getBothSideJoinPath(leftSourceX, rightSourceX, finalCenterY)}
      />
    );
  };

  const renderWinnerFinalConnector = () => {
    const finalMatch = matchByRoundAndNo(roundCount, 1);
    const winnerSide = finalMatch ? getWinnerSide(finalMatch) : undefined;
    if (!finalMatch || !winnerSide) {
      return null;
    }

    const finalCenterY = getBothSideJoinCenterY(viewModel.drawSize, slotHeight);
    const leftSourceX = leftRoundX(sideRounds[sideRounds.length - 1] ?? 1);
    const rightSourceX = rightRoundX(sideRounds[sideRounds.length - 1] ?? 1);
    const centerX = (leftSourceX + rightSourceX) / 2;
    const sourceX = winnerSide === "A" ? leftSourceX : rightSourceX;

    return (
      <path
        className="svg-connector winner svg-final-connector"
        style={{ strokeWidth: winnerStrokeWidth }}
        d={`M ${sourceX} ${finalCenterY} H ${centerX} M ${centerX} ${finalCenterY} V ${finalCenterY - connectorLength}`}
      />
    );
  };

  const renderSingleSideFinalConnector = () => {
    const finalTopY = matchCenterY(roundCount - 1, 0, "single");
    const finalBottomY = matchCenterY(roundCount - 1, 1, "single");
    const finalCenterY = (finalTopY + finalBottomY) / 2;
    const targetX = leftRoundX(roundCount);

    return (
      <path
        className="svg-connector svg-final-connector"
        style={{ strokeWidth: connectorStrokeWidth }}
        d={getSingleSideFinalConnectorPath(targetX, finalCenterY)}
      />
    );
  };

  const renderSingleSideWinnerFinalConnector = () => {
    const finalMatch = matchByRoundAndNo(roundCount, 1);
    if (!finalMatch?.winnerEntrantId) {
      return null;
    }
    const finalTopY = matchCenterY(roundCount - 1, 0, "single");
    const finalBottomY = matchCenterY(roundCount - 1, 1, "single");
    const finalCenterY = (finalTopY + finalBottomY) / 2;
    const targetX = leftRoundX(roundCount);
    const endpointX = targetX + connectorLength;

    return (
      <path
        className="svg-connector winner svg-final-connector"
        style={{ strokeWidth: winnerStrokeWidth }}
        d={`M ${targetX} ${finalCenterY} H ${endpointX} M ${endpointX} ${finalCenterY} V ${finalCenterY - connectorLength}`}
      />
    );
  };

  const renderChampionNumber = () => {
    if (viewModel.championDrawPosition === undefined) {
      return null;
    }

    if (bothSides) {
      const finalCenterY = getBothSideJoinCenterY(viewModel.drawSize, slotHeight);
      const leftSourceX = leftRoundX(sideRounds[sideRounds.length - 1] ?? 1);
      const rightSourceX = rightRoundX(sideRounds[sideRounds.length - 1] ?? 1);
      const centerX = (leftSourceX + rightSourceX) / 2;
      return (
        <text className="svg-champion-number" x={centerX} y={finalCenterY - connectorLength - 8} textAnchor="middle">
          No.{viewModel.championDrawPosition}
        </text>
      );
    }

    const finalTopY = matchCenterY(roundCount - 1, 0, "single");
    const finalBottomY = matchCenterY(roundCount - 1, 1, "single");
    const targetX = leftRoundX(roundCount) + connectorLength;
    return (
      <text className="svg-champion-number" x={targetX} y={(finalTopY + finalBottomY) / 2 - connectorLength - 8} textAnchor="end">
        No.{viewModel.championDrawPosition}
      </text>
    );
  };

  const { leftRows, rightRows } = getBothSideRowGroups(viewModel.rows, viewModel.drawSize);
  const renderBracketSvg = (
    className: string,
    svgPageNumber?: number,
  ) => (
    <svg
      className={className}
      role="img"
      aria-label={`${viewModel.title || "トーナメント"}のトーナメント表${svgPageNumber ? ` ${svgPageNumber}ページ目` : ""}`}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width={svgWidth}
      height={svgHeight}
      preserveAspectRatio={svgPageNumber ? "xMidYMin meet" : "xMidYMid meet"}
    >
      <g className="svg-connectors">
        {bothSides ? (
          <>
            {renderConnectors("left", sideRounds)}
            {renderConnectors("right", sideRounds)}
            {renderBothSideFinalConnector()}
          </>
        ) : (
          <>
            {renderConnectors("single", rounds)}
            {renderSingleSideFinalConnector()}
          </>
        )}
      </g>
      <g className="svg-winner-connectors">
        {bothSides ? (
          <>
            {renderWinnerConnectors("left", sideRounds)}
            {renderWinnerConnectors("right", sideRounds)}
            {renderWinnerFinalConnector()}
          </>
        ) : (
          <>
            {renderWinnerConnectors("single", rounds)}
            {renderSingleSideWinnerFinalConnector()}
          </>
        )}
      </g>
      <g className="svg-scores">
        {renderScoreDisplays()}
      </g>
      {renderChampionNumber()}

      {bothSides
        ? <>{leftRows.map((row, index) => renderSlot(row, index, "left"))}{rightRows.map((row, index) => renderSlot(row, index, "right"))}</>
        : viewModel.rows.map((row, index) => renderSlot(row, index, "single"))}
    </svg>
  );

  if (renderMode === "canvas") {
    return renderBracketSvg("svg-bracket page-svg-bracket", pageNumber);
  }

  const pageCount = getEffectiveOutputPageCount(
    viewModel.outputOptions.outputPageCount,
    viewModel.drawSize,
    viewModel.outputOptions.bracketLayout,
  );
  const pageBrackets = getPrintPageBrackets(
    viewModel.rows,
    viewModel.drawSize,
    pageCount,
  );

  const renderHeading = () => (
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
  );

  const renderPage = (
    pageBracket: PrintPageBracket,
    index: number,
    output: "screen" | "print",
  ) => (
    <section
      className={output === "screen"
        ? "draw-preview screen-draw-page"
        : "print-page draw-preview print-draw-page"}
      key={`${output}-${index + 1}`}
    >
      <div className="draw-page-content">
        {renderHeading()}
        <div className="page-bracket-viewport">
          {(() => {
            const pageMatches = getPrintPageMatches(viewModel.matches, pageBracket.drawSize, index);
            return <DrawPreview
              viewModel={{
                ...viewModel,
                drawSize: pageBracket.drawSize,
                rows: pageBracket.rows,
                matches: pageMatches,
                scoreDisplays: getPrintPageScoreDisplays(viewModel.scoreDisplays, pageMatches),
              }}
              generatedAt={generatedAt}
              renderMode="canvas"
              pageNumber={index + 1}
            />;
          })()}
        </div>
        <footer className="draw-page-footer" aria-label={`${index + 1} / ${pageCount}ページ`}>
          {index + 1} / {pageCount}ページ
        </footer>
      </div>
    </section>
  );

  return (
    <>
      <div className="draw-page-preview-list">
        {pageBrackets.map((pageBracket, index) => renderPage(pageBracket, index, "screen"))}
      </div>

      <div className="print-draw-pages">
        {pageBrackets.map((pageBracket, index) => renderPage(pageBracket, index, "print"))}
      </div>
    </>
  );
}

function getLineWidth(lineWeight: "thin" | "normal" | "bold" | "extraBold"): number {
  return {
    thin: 1,
    normal: 2,
    bold: 3,
    extraBold: 4,
  }[lineWeight];
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
