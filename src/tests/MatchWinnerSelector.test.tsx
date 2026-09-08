// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchWinnerSelector } from "../components/MatchWinnerSelector";

afterEach(cleanup);

describe("MatchWinnerSelector", () => {
  it("勝者ボタンの選択、切り替え、再押下による未実施への戻しを通知する", () => {
    const onResultChange = vi.fn();
    const { rerender } = render(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="unplayed"
        onResultChange={onResultChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aの勝ち" }));
    expect(onResultChange).toHaveBeenLastCalledWith("participantAWin");

    rerender(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="participantAWin"
        onResultChange={onResultChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aの勝ち" }));
    expect(onResultChange).toHaveBeenLastCalledWith("unplayed");

    rerender(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="unplayed"
        onResultChange={onResultChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bの勝ち" }));
    expect(onResultChange).toHaveBeenLastCalledWith("participantBWin");
  });

  it("リーグでは引き分けを選択して再押下で未実施へ戻せる", () => {
    const onResultChange = vi.fn();
    const { rerender } = render(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="unplayed"
        onResultChange={onResultChange}
      />,
    );

    const drawButton = screen.getByRole("button", { name: "引き分け" });
    expect(drawButton).toHaveProperty("disabled", false);
    fireEvent.click(drawButton);
    expect(onResultChange).toHaveBeenLastCalledWith("draw");

    rerender(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="draw"
        onResultChange={onResultChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "引き分け" }));
    expect(onResultChange).toHaveBeenLastCalledWith("unplayed");
  });

  it("トーナメントの引き分けは無効色の無効ボタンで、勝者ボタンは選択できる", () => {
    const onResultChange = vi.fn();
    render(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="unplayed"
        drawDisabled
        onResultChange={onResultChange}
      />,
    );

    expect(screen.getByRole("button", { name: "引き分け" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Aの勝ち" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Bの勝ち" })).toHaveProperty("disabled", false);
  });

  it("無効状態では勝者・引き分けの入力を受け付けない", () => {
    const onResultChange = vi.fn();
    render(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="unplayed"
        disabled
        onResultChange={onResultChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Aの勝ち" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Bの勝ち" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "引き分け" })).toHaveProperty("disabled", true);
  });

  it("編集不可でも選択済みの勝者・引き分けは選択色を維持する", () => {
    const onResultChange = vi.fn();
    const { rerender } = render(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="participantAWin"
        disabled
        onResultChange={onResultChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Aの勝ち" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "Aの勝ち" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Bの勝ち" }).className).not.toContain("active");

    rerender(
      <MatchWinnerSelector
        ariaLabel="第1試合の結果"
        participantALabel="A"
        participantBLabel="B"
        result="draw"
        disabled
        onResultChange={onResultChange}
      />,
    );

    expect(screen.getByRole("button", { name: "引き分け" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "引き分け" })).toHaveProperty("disabled", true);
  });
});
