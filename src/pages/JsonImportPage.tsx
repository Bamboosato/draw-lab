import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEntrantStats, validateTournamentForUi } from "../app/tournamentModel";
import { createSampleJson, parseJsonImport } from "../app/tournamentPersistence";
import { useTournaments } from "../app/TournamentProvider";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TournamentFilePicker, type FileProcessStatus } from "../components/TournamentFilePicker";
import { ValidationBanner } from "../components/ValidationBanner";

export function JsonImportPage() {
  const navigate = useNavigate();
  const {
    importTournament,
    replaceAllTournaments,
    storageError,
    storageStatus,
    tournaments,
  } = useTournaments();
  const [parsed, setParsed] = useState(() => parseJsonImport(""));
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const [fileProcess, setFileProcess] = useState<{ fileName?: string; status: FileProcessStatus }>({ status: "idle" });
  const processingRef = useRef(false);
  const validation = useMemo(
    () => parsed.state === "success" && parsed.kind === "tournament"
      ? validateTournamentForUi(parsed.tournament)
      : { errors: [], warnings: [] },
    [parsed],
  );
  const stats = useMemo(
    () => parsed.state === "success" && parsed.kind === "tournament"
      ? getEntrantStats(parsed.tournament)
      : undefined,
    [parsed],
  );
  const backup = parsed.state === "success" && parsed.kind === "backup" ? parsed.backup : undefined;
  const busy = storageStatus !== "ready";
  const fileProcessing = fileProcess.status === "reading" || fileProcess.status === "processing";
  const interactionDisabled = busy || fileProcessing;

  const analyze = useCallback((content: string) => {
    const result = parseJsonImport(content);
    setParsed(result);
    setRestoreError(undefined);
    setConfirmRestore(false);
    return result;
  }, []);

  const processSource = useCallback(async (
    fileName: string,
    initialStatus: "reading" | "processing",
    readContent: () => Promise<string>,
  ): Promise<void> => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    setFileProcess({ fileName, status: initialStatus });
    setRestoreError(undefined);
    setConfirmRestore(false);

    try {
      const content = await readContent();
      setFileProcess({ fileName, status: "processing" });
      await waitForNextFrame();
      const result = analyze(content);
      setFileProcess({ fileName, status: result.state === "error" ? "error" : "complete" });
    } catch {
      setParsed({
        state: "error",
        code: "FILE_READ_ERROR",
        message: "ファイルを読み込めません。大会情報ファイルを確認してください。",
      });
      setFileProcess({ fileName, status: "error" });
    } finally {
      processingRef.current = false;
    }
  }, [analyze]);

  const restoreBackup = async (): Promise<void> => {
    if (!backup) {
      return;
    }

    setConfirmRestore(false);
    setRestoreError(undefined);
    try {
      await replaceAllTournaments(backup.tournaments);
      navigate("/");
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "全大会の復元に失敗しました。");
    }
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p>DrawLabから出力した大会情報ファイルを選択してください。ファイルの内容は表示されません。</p>
        </div>
      </section>

      {storageStatus === "loading" ? <p className="storage-status" role="status">IndexedDBを読み込んでいます。</p> : null}
      {storageStatus === "error" ? (
        <section className="import-result error" role="alert">
          <h3>大会情報の復元を開始できません</h3>
          <p>{storageError || "IndexedDBを利用できません。ページを再読み込みしてください。"}</p>
        </section>
      ) : null}

      <section className="import-layout">
        <div className="settings-panel file-picker-container">
          <TournamentFilePicker
            disabled={interactionDisabled}
            fileName={fileProcess.fileName}
            status={fileProcess.status}
            onFileSelected={(file) => {
              void processSource(file.name, "reading", () => file.text());
            }}
            onSampleSelected={() => {
              void processSource("サンプルデータ", "processing", async () => createSampleJson());
            }}
          />
        </div>

        <aside className={`import-result ${parsed.state}`}>
          <h3>読込結果</h3>
          <p>{parsed.message}</p>
          {parsed.state === "success" && parsed.kind === "tournament" && stats ? (
            <dl className="summary-list">
              <div><dt>データ種別</dt><dd>個別大会（追加）</dd></div>
              <div><dt>大会名</dt><dd>{parsed.tournament.title || "無題のトーナメント"}</dd></div>
              <div><dt>参加者数</dt><dd>{stats.activeEntrantCount}</dd></div>
              <div><dt>シード指定</dt><dd>{stats.seedAssignedCount}</dd></div>
              <div><dt>BYE数</dt><dd>{stats.byeCount === undefined ? "不正" : stats.byeCount}</dd></div>
            </dl>
          ) : null}
          {backup ? (
            <>
              <dl className="summary-list">
                <div><dt>データ種別</dt><dd>全大会バックアップ（全置換）</dd></div>
                <div><dt>バックアップ件数</dt><dd>{backup.tournaments.length}</dd></div>
                <div><dt>現在の件数</dt><dd>{tournaments.length}</dd></div>
                <div><dt>出力日時</dt><dd>{formatDateTime(backup.exportedAt)}</dd></div>
              </dl>
              <p className="field-hint">
                {backup.tournaments.length === 0
                  ? "0件のバックアップを復元すると、現在の全大会が削除されます。"
                  : "復元すると現在の全大会を削除し、このバックアップの内容に置き換えます。"}
              </p>
            </>
          ) : null}
          {parsed.state === "success" && parsed.kind === "tournament" ? (
            <ValidationBanner
              errors={validation.errors}
              warnings={validation.warnings}
              entrants={parsed.tournament.entrants}
              compact
            />
          ) : null}
          {restoreError ? <p role="alert">{restoreError}</p> : null}
        </aside>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="トーナメント一覧へ戻る" disabled={interactionDisabled} onClick={() => navigate("/")}>一覧へ戻る</button>
        {parsed.state === "success" && parsed.kind === "tournament" ? (
          <button
            type="button"
            className="button primary"
            title="解析した個別大会を追加"
            disabled={interactionDisabled || validation.errors.length > 0}
            onClick={() => {
              importTournament(parsed.tournament);
              navigate("/");
            }}
          >
            個別大会を追加
          </button>
        ) : (
          <button
            type="button"
            className="button danger"
            title="全大会バックアップで現在のデータを置き換える"
            disabled={!backup || interactionDisabled}
            onClick={() => setConfirmRestore(true)}
          >
            全大会を復元
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRestore && Boolean(backup)}
        title="現在の全大会を置き換えます"
        message={`現在の${tournaments.length}件を削除し、バックアップの${backup?.tournaments.length ?? 0}件に置き換えます。この操作を実行しますか？`}
        confirmLabel="全置換する"
        cancelLabel="キャンセル"
        tone="danger"
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => void restoreBackup()}
      />
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
