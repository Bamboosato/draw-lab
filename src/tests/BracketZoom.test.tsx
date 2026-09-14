// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BracketZoomControls,
  BracketZoomViewport,
  clampBracketZoom,
} from "../components/BracketZoom";

afterEach(cleanup);

describe("BracketZoomControls", () => {
  it("拡大・縮小・リセットの操作を表示倍率の変更として通知する", () => {
    const onZoomChange = vi.fn();
    const { rerender } = render(<BracketZoomControls zoom={1} onZoomChange={onZoomChange} />);

    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "トーナメント表を拡大" }));
    expect(onZoomChange).toHaveBeenLastCalledWith(1.25);

    onZoomChange.mockClear();
    rerender(<BracketZoomControls zoom={2} onZoomChange={onZoomChange} />);
    fireEvent.click(screen.getByRole("button", { name: "トーナメント表を縮小" }));
    expect(onZoomChange).toHaveBeenLastCalledWith(1.5);
    fireEvent.click(screen.getByRole("button", { name: "リセット" }));
    expect(onZoomChange).toHaveBeenLastCalledWith(1);
    expect(screen.queryByText("表示倍率")).toBeNull();
    expect(screen.queryByText("ピンチ・ドラッグで移動")).toBeNull();
  });

  it("表示倍率を1倍から3倍の範囲に制限する", () => {
    expect(clampBracketZoom(0.5)).toBe(1);
    expect(clampBracketZoom(1.75)).toBe(1.75);
    expect(clampBracketZoom(4)).toBe(3);
  });
});

describe("BracketZoomViewport", () => {
  it("拡大時は表の操作領域を倍率に応じて広げる", () => {
    render(
      <BracketZoomViewport zoom={2} onZoomChange={vi.fn()}>
        <svg aria-label="テスト表" />
      </BracketZoomViewport>,
    );

    const surface = document.querySelector(".bracket-zoom-surface");
    expect(surface?.getAttribute("style")).toContain("width: 200%");
    expect(screen.getByRole("region", { name: "トーナメント表の拡大表示領域" })).toBeTruthy();
  });
});
