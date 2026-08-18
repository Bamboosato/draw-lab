// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentFilePicker, type FileProcessStatus } from "../components/TournamentFilePicker";

afterEach(cleanup);

function renderPicker(options?: {
  disabled?: boolean;
  fileName?: string;
  status?: FileProcessStatus;
  onFileSelected?: (file: File) => void;
  onSampleSelected?: () => void;
}) {
  const props = {
    disabled: options?.disabled ?? false,
    fileName: options?.fileName,
    status: options?.status ?? "idle" as FileProcessStatus,
    onFileSelected: options?.onFileSelected ?? vi.fn(),
    onSampleSelected: options?.onSampleSelected ?? vi.fn(),
  };
  const view = render(<TournamentFilePicker {...props} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;

  return { ...view, input, props };
}

describe("TournamentFilePicker", () => {
  it("ネイティブ入力をDOMに保持し、同じファイルを再選択しても1回ずつ通知する", () => {
    const onFileSelected = vi.fn();
    const { input } = renderPicker({ onFileSelected });
    const file = new File(["{}"], "大会情報.json", { type: "application/json" });

    expect(input).toBeTruthy();
    expect(input.accept).toBe("application/json,.json");

    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenLastCalledWith(file);
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(2);
  });

  it("ドラッグ中の受付表示を行い、ドロップしたファイルを通常選択と同じコールバックへ渡す", () => {
    const onFileSelected = vi.fn();
    renderPicker({ onFileSelected });
    const zone = screen.getByRole("button", { name: "大会情報ファイルを選択" });
    const file = new File(["{}"], "drop.json", { type: "application/json" });

    fireEvent.dragEnter(zone, { dataTransfer: { files: [file] } });
    expect(zone.classList.contains("dragging")).toBe(true);

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(zone.classList.contains("dragging")).toBe(false);
  });

  it("選択エリアをEnterまたはSpaceで操作できる", () => {
    const { input } = renderPicker();
    const click = vi.spyOn(input, "click");
    const zone = screen.getByRole("button", { name: "大会情報ファイルを選択" });

    fireEvent.keyDown(zone, { key: "Enter" });
    fireEvent.keyDown(zone, { key: " " });

    expect(click).toHaveBeenCalledTimes(2);
  });

  it("処理中は再選択・ドロップ・サンプル操作を無効にし、状態を通知する", () => {
    const onFileSelected = vi.fn();
    const onSampleSelected = vi.fn();
    const { container, input } = renderPicker({
      disabled: true,
      fileName: "処理中.json",
      status: "reading",
      onFileSelected,
      onSampleSelected,
    });
    const zone = screen.getByRole("button", { name: "大会情報ファイルを選択" });
    const file = new File(["{}"], "ignored.json", { type: "application/json" });

    expect(input.disabled).toBe(true);
    expect(zone.getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("button", { name: "別のファイルを選択" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "サンプルデータを使用" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("処理中.json読み込み中");
    expect(container.querySelector(".file-process-spinner")).toBeTruthy();

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "サンプルデータを使用" }));
    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onSampleSelected).not.toHaveBeenCalled();
  });

  it.each([
    { status: "processing" as const, expected: "処理中" },
    { status: "complete" as const, expected: "完了" },
    { status: "error" as const, expected: "エラー" },
  ])("$status の状態とファイル名を文字で表示する", ({ status, expected }) => {
    renderPicker({ fileName: "選択済み.json", status, disabled: status === "processing" });

    expect(screen.getByRole("status").textContent).toContain("選択済み.json");
    expect(screen.getByRole("status").textContent).toContain(expected);
  });

  it("サンプルデータ操作を1クリックにつき1回だけ通知する", () => {
    const onSampleSelected = vi.fn();
    renderPicker({ onSampleSelected });

    fireEvent.click(screen.getByRole("button", { name: "サンプルデータを使用" }));

    expect(onSampleSelected).toHaveBeenCalledTimes(1);
  });
});
