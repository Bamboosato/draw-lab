import { useRef } from "react";
import type { PointerEvent, PointerEventHandler, ReactNode, WheelEventHandler } from "react";

export const BRACKET_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export const DEFAULT_BRACKET_ZOOM = BRACKET_ZOOM_LEVELS[0];

export type BracketZoomLevel = number;

type BracketZoomControlsProps = {
  zoom: BracketZoomLevel;
  onZoomChange: (zoom: BracketZoomLevel) => void;
};

export function BracketZoomControls({ zoom, onZoomChange }: BracketZoomControlsProps) {
  const normalizedZoom = clampBracketZoom(zoom);
  const currentIndex = getClosestZoomIndex(normalizedZoom);

  return (
    <div className="bracket-zoom-controls no-print" aria-label="トーナメント表の表示倍率">
      <button
        type="button"
        className="button secondary bracket-zoom-button"
        aria-label="トーナメント表を縮小"
        disabled={normalizedZoom <= BRACKET_ZOOM_LEVELS[0]}
        onClick={() => onZoomChange(BRACKET_ZOOM_LEVELS[Math.max(0, currentIndex - 1)] ?? BRACKET_ZOOM_LEVELS[0])}
      >
        −
      </button>
      <output className="bracket-zoom-value" aria-live="polite">
        {Math.round(normalizedZoom * 100)}%
      </output>
      <button
        type="button"
        className="button secondary bracket-zoom-button"
        aria-label="トーナメント表を拡大"
        disabled={normalizedZoom >= BRACKET_ZOOM_LEVELS[BRACKET_ZOOM_LEVELS.length - 1]}
        onClick={() => onZoomChange(BRACKET_ZOOM_LEVELS[Math.min(BRACKET_ZOOM_LEVELS.length - 1, currentIndex + 1)] ?? BRACKET_ZOOM_LEVELS[BRACKET_ZOOM_LEVELS.length - 1])}
      >
        ＋
      </button>
      <button
        type="button"
        className="button secondary bracket-zoom-reset"
        disabled={normalizedZoom === DEFAULT_BRACKET_ZOOM}
        onClick={() => onZoomChange(DEFAULT_BRACKET_ZOOM)}
      >
        リセット
      </button>
    </div>
  );
}

type Point = {
  x: number;
  y: number;
};

type Gesture =
  | { type: "pan"; lastPoint: Point }
  | { type: "pinch"; startDistance: number; startZoom: number };

type BracketZoomViewportProps = {
  zoom: BracketZoomLevel;
  onZoomChange: (zoom: BracketZoomLevel) => void;
  children: ReactNode;
};

export function BracketZoomViewport({ zoom, onZoomChange, children }: BracketZoomViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | undefined>(undefined);

  const getPoint = (event: PointerEvent<HTMLDivElement>): Point => ({
    x: event.clientX,
    y: event.clientY,
  });

  const getPointerDistance = (): number | undefined => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return undefined;
    const first = points[0]!;
    const second = points[1]!;
    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType === "mouse" && zoom <= DEFAULT_BRACKET_ZOOM) return;

    const point = getPoint(event);
    pointersRef.current.set(event.pointerId, point);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers do not expose pointer capture for synthetic or passive pointers.
    }

    if (pointersRef.current.size >= 2) {
      gestureRef.current = {
        type: "pinch",
        startDistance: getPointerDistance() ?? 1,
        startZoom: zoom,
      };
    } else {
      gestureRef.current = { type: "pan", lastPoint: point };
    }
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;

    const point = getPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;

    if (!gesture) return;

    if (pointersRef.current.size >= 2 && gesture.type === "pinch") {
      const distance = getPointerDistance();
      if (distance && gesture.startDistance > 0) {
        onZoomChange(clampBracketZoom(gesture.startZoom * distance / gesture.startDistance));
      }
      return;
    }

    if (pointersRef.current.size !== 1 || gesture.type !== "pan") return;

    const deltaX = point.x - gesture.lastPoint.x;
    const deltaY = point.y - gesture.lastPoint.y;
    gesture.lastPoint = point;

    if (zoom > DEFAULT_BRACKET_ZOOM) {
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.scrollLeft -= deltaX;
        viewport.scrollTop -= deltaY;
      }
    } else if (event.pointerType === "touch" && deltaY !== 0) {
      window.scrollBy(0, -deltaY);
    }
  };

  const handlePointerEnd: PointerEventHandler<HTMLDivElement> = (event) => {
    pointersRef.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }

    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1) {
      gestureRef.current = { type: "pan", lastPoint: remaining[0]![1] };
    } else if (remaining.length === 0) {
      gestureRef.current = undefined;
    }
  };

  const handleWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    onZoomChange(clampBracketZoom(zoom * Math.exp(-event.deltaY * 0.002)));
  };

  const normalizedZoom = clampBracketZoom(zoom);

  return (
    <div
      ref={viewportRef}
      className="page-bracket-viewport bracket-zoom-viewport"
      role="region"
      aria-label="トーナメント表の拡大表示領域"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
    >
      <div
        className="bracket-zoom-surface"
        style={{
          width: `${normalizedZoom * 100}%`,
          height: `${normalizedZoom * 100}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function clampBracketZoom(value: number): BracketZoomLevel {
  return Math.min(
    BRACKET_ZOOM_LEVELS[BRACKET_ZOOM_LEVELS.length - 1],
    Math.max(BRACKET_ZOOM_LEVELS[0], value),
  );
}

function getClosestZoomIndex(value: BracketZoomLevel): number {
  return BRACKET_ZOOM_LEVELS.reduce((closestIndex, level, index) => {
    const closest = BRACKET_ZOOM_LEVELS[closestIndex] ?? BRACKET_ZOOM_LEVELS[0];
    return Math.abs(level - value) < Math.abs(closest - value) ? index : closestIndex;
  }, 0);
}
