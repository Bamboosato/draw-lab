import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

export type FileProcessStatus = "idle" | "reading" | "processing" | "complete" | "error";

type TournamentFilePickerProps = {
  disabled: boolean;
  fileName?: string;
  status: FileProcessStatus;
  onFileSelected: (file: File) => void;
  onSampleSelected: () => void;
};

const STATUS_LABELS: Record<Exclude<FileProcessStatus, "idle">, string> = {
  reading: "読み込み中",
  processing: "処理中",
  complete: "完了",
  error: "エラー",
};

export function TournamentFilePicker({
  disabled,
  fileName,
  status,
  onFileSelected,
  onSampleSelected,
}: TournamentFilePickerProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const processing = status === "reading" || status === "processing";

  const openFileDialog = (): void => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleZoneKeyDown = (event: KeyboardEvent<HTMLLabelElement>): void => {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openFileDialog();
  };

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) {
      return;
    }

    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragging(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    if (disabled) {
      return;
    }

    const file = event.dataTransfer.files[0];
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <section className="file-picker-panel" aria-labelledby={`${inputId}-title`}>
      <h2 className="file-picker-title" id={`${inputId}-title`}>大会情報ファイル</h2>
      <input
        ref={inputRef}
        id={inputId}
        className="visually-hidden-file-input"
        type="file"
        accept="application/json,.json"
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            onFileSelected(file);
          }
        }}
      />
      <label
        className={`file-drop-zone${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
        htmlFor={inputId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="大会情報ファイルを選択"
        aria-describedby={hintId}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
          }
        }}
        onKeyDown={handleZoneKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <FileSelectionIcon />
        <span className="file-drop-primary">ファイルをドラッグ＆ドロップ</span>
        <span className="file-drop-or">または</span>
        <span className="button secondary file-drop-button" aria-hidden="true">ファイルを選択</span>
        <span className="file-picker-format">対応形式：DrawLab大会情報ファイル（.json）</span>
      </label>
      <p className="file-picker-auto-hint" id={hintId}>ファイルを選択すると、自動的に処理を開始します。</p>

      {status !== "idle" && fileName ? (
        <div className={`file-picker-status ${status}`} role="status" aria-live="polite" aria-atomic="true">
          <span className={`file-process-indicator ${status}`} aria-hidden="true">
            {processing ? <span className="file-process-spinner" /> : status === "complete" ? "✓" : "!"}
          </span>
          <span className="file-picker-status-copy">
            <span className="file-picker-name">{fileName}</span>
            <span className="file-picker-status-label">{STATUS_LABELS[status]}</span>
          </span>
          <button
            type="button"
            className="button secondary file-reselect-button"
            disabled={disabled}
            onClick={openFileDialog}
          >
            別のファイルを選択
          </button>
        </div>
      ) : null}

      <div className="sample-data-action">
        <button
          type="button"
          className="button secondary"
          title="サンプルの大会情報を読み込む"
          disabled={disabled}
          onClick={onSampleSelected}
        >
          サンプルデータを使用
        </button>
      </div>
    </section>
  );
}

function FileSelectionIcon() {
  return (
    <svg className="file-selection-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M14 5h14l8 8v28H14z" />
      <path d="M28 5v9h8" />
      <path d="M24 33V20" />
      <path d="m19 25 5-5 5 5" />
    </svg>
  );
}
