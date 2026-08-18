export type OverflowMenuPosition = {
  top: number;
  left: number;
  placement: "above" | "below" | "viewport";
};

export function getOverflowMenuPosition({
  trigger,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = 6,
  margin = 8,
}: {
  trigger: Pick<DOMRect, "top" | "right" | "bottom">;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}): OverflowMenuPosition {
  const left = Math.max(
    margin,
    Math.min(trigger.right - menuWidth, viewportWidth - menuWidth - margin),
  );
  const visibleMenuHeight = Math.min(menuHeight, Math.max(0, viewportHeight - margin * 2));
  const belowTop = trigger.bottom + gap;
  const aboveTop = trigger.top - gap - visibleMenuHeight;
  const spaceBelow = viewportHeight - margin - belowTop;
  const spaceAbove = trigger.top - gap - margin;

  if (visibleMenuHeight <= spaceBelow) {
    return { top: belowTop, left, placement: "below" };
  }

  if (visibleMenuHeight <= spaceAbove) {
    return { top: aboveTop, left, placement: "above" };
  }

  const maxTop = Math.max(margin, viewportHeight - margin - visibleMenuHeight);
  return {
    top: Math.max(margin, Math.min(belowTop, maxTop)),
    left,
    placement: "viewport",
  };
}
