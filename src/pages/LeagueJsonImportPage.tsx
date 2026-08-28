import { useState } from "react";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { useLeagues } from "../app/LeagueProvider";
import { parseLeagueJson } from "../storage/leagueJson";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LeaguePageHeading, LeagueStorageMessage } from "../components/LeaguePageParts";

export function LeagueJsonImportPage() {
  const navigate = useViewTransitionNavigate();
  const {
    importLeague,
    replaceAllLeagues,
    leagues,
    storageError,
    storageStatus,
  } = useLeagues();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(() => parseLeagueJson(""));
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();

  const readFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }

    void file.text().then((value) => {
      setText(value);
      setParsed(parseLeagueJson(value));
      setRestoreError(undefined);
    }).catch((error: unknown) => {
      setRestoreError(error instanceof Error ? error.message : "ファイルを読み込めませんでした。");
    });
  };

  const preview = () => {
    const result = parseLeagueJson(text);
    setParsed(result);
    setRestoreError(undefined);
    return result;
  };

  const restore = (): void => {
    const result = preview();
    if (result.state !== "success") {
      return;
    }
    if (result.kind === "backup") {
      setConfirmRestore(true);
      return;
    }

    importLeague(result.league);
    navigate("/leagues");
  };

  const restoreBackup = async (): Promise<void> => {
    if (parsed.state !== "success" || parsed.kind !== "backup") {
      return;
    }

    setConfirmRestore(false);
    setRestoreError(undefined);
    try {
      await replaceAllLeagues(parsed.backup.leagues);
      navigate("/leagues");
    } catch (error: unknown) {
      setRestoreError(error instanceof Error ? error.message : "全リーグの復元に失敗しました。");
    }
  };

  const interactionDisabled = storageStatus !== "ready";

  return (
    <div className="page-stack league-page league-restore-page">
      <LeaguePageHeading description="DrawLabから出力したリーグ情報ファイルを選択してください。個別リーグの追加または全リーグの置換復元を行えます。" />
      <LeagueStorageMessage status={storageStatus} error={storageError} />
      <section className="section-card paste-panel">
        <label className="field">
          <span>JSONファイル</span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={interactionDisabled}
            onChange={(event) => readFile(event.target.files?.[0])}
          />
        </label>
        <label className="field">
          <span>JSON本文</span>
          <textarea
            value={text}
            disabled={interactionDisabled}
            onChange={(event) => {
              setText(event.target.value);
              setParsed(parseLeagueJson(event.target.value));
              setRestoreError(undefined);
            }}
          />
        </label>
        <section className={`import-result ${parsed.state}`} role={parsed.state === "error" ? "alert" : "status"}>
          <h3>読込結果</h3>
          <p>{parsed.message}</p>
          {parsed.state === "success" && parsed.kind === "league" ? (
            <dl className="summary-list">
              <div><dt>データ種別</dt><dd>個別リーグ（追加）</dd></div>
              <div><dt>大会名</dt><dd>{parsed.league.title || "無題のリーグ"}</dd></div>
              <div><dt>参加単位数</dt><dd>{parsed.league.participants.length}</dd></div>
            </dl>
          ) : null}
          {parsed.state === "success" && parsed.kind === "backup" ? (
            <>
              <dl className="summary-list">
                <div><dt>データ種別</dt><dd>全リーグバックアップ（全置換）</dd></div>
                <div><dt>バックアップ件数</dt><dd>{parsed.backup.leagues.length}</dd></div>
                <div><dt>現在の件数</dt><dd>{leagues.length}</dd></div>
                <div><dt>出力日時</dt><dd>{formatDateTime(parsed.backup.exportedAt)}</dd></div>
              </dl>
              <p className="field-hint">
                {parsed.backup.leagues.length === 0
                  ? "0件のバックアップを復元すると、現在の全リーグが削除されます。"
                  : "復元すると現在の全リーグを削除し、このバックアップの内容に置き換えます。"}
              </p>
            </>
          ) : null}
          {restoreError ? <p role="alert">{restoreError}</p> : null}
        </section>
        <div className="button-row">
          <button type="button" className="button secondary" disabled={interactionDisabled} onClick={() => navigate("/leagues")}>一覧へ戻る</button>
          {parsed.state === "success" && parsed.kind === "league" ? (
            <button type="button" className="button primary" disabled={interactionDisabled} onClick={restore}>個別リーグを追加</button>
          ) : (
            <button type="button" className="button danger" disabled={interactionDisabled || parsed.state !== "success" || parsed.kind !== "backup"} onClick={restore}>全リーグを復元</button>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={confirmRestore && parsed.state === "success" && parsed.kind === "backup"}
        title="現在の全リーグを置き換えます"
        message={`現在の${leagues.length}件を削除し、バックアップの${parsed.state === "success" && parsed.kind === "backup" ? parsed.backup.leagues.length : 0}件に置き換えます。この操作を実行しますか？`}
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
