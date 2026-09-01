import { useCallback, useRef, useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { useLeagues } from "../app/LeagueProvider";
import { parseLeagueJson } from "../storage/leagueJson";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TournamentFilePicker, type FileProcessStatus } from "../components/TournamentFilePicker";

export function LeagueJsonImportPage() {
  const navigate = useViewTransitionNavigate();
  const {
    importLeague,
    replaceAllLeagues,
    leagues,
    storageError,
    storageStatus,
  } = useLeagues();
  const [parsed, setParsed] = useState(() => parseLeagueJson(""));
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const [fileProcess, setFileProcess] = useState<{ fileName?: string; status: FileProcessStatus }>({ status: "idle" });
  const processingRef = useRef(false);
  const backup = parsed.state === "success" && parsed.kind === "backup" ? parsed.backup : undefined;
  const busy = storageStatus !== "ready";
  const fileProcessing = fileProcess.status === "reading" || fileProcess.status === "processing";
  const interactionDisabled = busy || fileProcessing;

  const analyze = useCallback((content: string) => {
    const result = parseLeagueJson(content);
    setParsed(result);
    setRestoreError(undefined);
    setConfirmRestore(false);
    return result;
  }, []);

  const processSource = useCallback(async (
    fileName: string,
    readContent: () => Promise<string>,
  ): Promise<void> => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    setFileProcess({ fileName, status: "reading" });
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
        message: "ファイルを読み込めません。リーグ情報ファイルを確認してください。",
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
      await replaceAllLeagues(backup.leagues);
      navigate("/leagues");
    } catch (error: unknown) {
      setRestoreError(error instanceof Error ? error.message : "全リーグの復元に失敗しました。");
    }
  };

  return (
    <div className="page-stack restore-page league-restore-page">
      <section className="page-heading">
        <div>
          <p>DrawLabから出力したリーグ情報ファイルを選択してください。ファイルの内容は表示されません。</p>
        </div>
      </section>

      {storageStatus === "loading" ? <p className="storage-status" role="status">IndexedDBを読み込んでいます。</p> : null}
      {storageStatus === "error" ? (
        <section className="import-result error" role="alert">
          <h3>リーグ情報の復元を開始できません</h3>
          <p>{storageError || "IndexedDBを利用できません。ページを再読み込みしてください。"}</p>
        </section>
      ) : null}

      <section className="import-layout">
        <div className="settings-panel file-picker-container">
          <TournamentFilePicker
            disabled={interactionDisabled}
            fileName={fileProcess.fileName}
            status={fileProcess.status}
            title="リーグ情報ファイル"
            ariaLabel="リーグ情報ファイルを選択"
            formatLabel="対応形式：DrawLabリーグ情報ファイル（.json）"
            onFileSelected={(file) => {
              void processSource(file.name, () => file.text());
            }}
          />
        </div>

        <aside className={`import-result ${parsed.state}`}>
          <h3>読込結果</h3>
          <p>{parsed.message}</p>
          {parsed.state === "success" && parsed.kind === "league" ? (
            <dl className="summary-list">
              <div><dt>データ種別</dt><dd>個別リーグ（追加）</dd></div>
              <div><dt>大会名</dt><dd>{parsed.league.title || "無題のリーグ"}</dd></div>
              <div><dt>参加単位数</dt><dd>{parsed.league.participants.length}</dd></div>
            </dl>
          ) : null}
          {backup ? (
            <>
              <dl className="summary-list">
                <div><dt>データ種別</dt><dd>全リーグバックアップ（全置換）</dd></div>
                <div><dt>バックアップ件数</dt><dd>{backup.leagues.length}</dd></div>
                <div><dt>現在の件数</dt><dd>{leagues.length}</dd></div>
                <div><dt>出力日時</dt><dd>{formatDateTime(backup.exportedAt)}</dd></div>
              </dl>
              <p className="field-hint">
                {backup.leagues.length === 0
                  ? "0件のバックアップを復元すると、現在の全リーグが削除されます。"
                  : "復元すると現在の全リーグを削除し、このバックアップの内容に置き換えます。"}
              </p>
            </>
          ) : null}
          {restoreError ? <p role="alert">{restoreError}</p> : null}
        </aside>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" title="リーグ一覧へ戻る" disabled={interactionDisabled} onClick={() => navigate("/leagues")}>一覧へ戻る</button>
        {parsed.state === "success" && parsed.kind === "league" ? (
          <button
            type="button"
            className="button primary"
            title="解析した個別リーグを追加"
            disabled={interactionDisabled}
            onClick={() => {
              importLeague(parsed.league);
              navigate("/leagues");
            }}
          >
            個別リーグを追加
          </button>
        ) : (
          <button
            type="button"
            className="button danger"
            title="全リーグバックアップで現在のデータを置き換える"
            disabled={!backup || interactionDisabled}
            onClick={() => setConfirmRestore(true)}
          >
            全リーグを復元
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRestore && Boolean(backup)}
        title="現在の全リーグを置き換えます"
        message={`現在の${leagues.length}件を削除し、バックアップの${backup?.leagues.length ?? 0}件に置き換えます。この操作を実行しますか？`}
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
