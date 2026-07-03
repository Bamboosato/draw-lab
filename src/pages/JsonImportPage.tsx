import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { compactTournament, getEntrantStats, validateTournamentForUi } from "../app/tournamentModel";
import { createSampleJson, parseTournamentImport } from "../app/tournamentPersistence";
import { useTournaments } from "../app/TournamentProvider";
import { ValidationBanner } from "../components/ValidationBanner";

export function JsonImportPage() {
  const navigate = useNavigate();
  const { importTournament } = useTournaments();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(() => parseTournamentImport(""));
  const validation = useMemo(
    () => parsed.state === "success" ? validateTournamentForUi(parsed.tournament) : { errors: [], warnings: [] },
    [parsed],
  );
  const stats = useMemo(
    () => parsed.state === "success" ? getEntrantStats(parsed.tournament) : undefined,
    [parsed],
  );

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Tournament Data Import</p>
          <h2>大会情報読込</h2>
          <p>保存済みの大会情報ファイルから大会データや参加者リストを復元します。</p>
        </div>
      </section>

      <section className="import-layout">
        <div className="settings-panel">
          <label className="field">
            <span>大会情報ファイル</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (!file) {
                  return;
                }

                void file.text().then((content) => {
                  setText(content);
                  setParsed(parseTournamentImport(content));
                });
              }}
            />
          </label>
          <label className="field">
            <span>大会情報テキストを直接入力</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => setParsed(parseTournamentImport(text))}>データを解析</button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const sample = createSampleJson();
                setText(sample);
                setParsed(parseTournamentImport(sample));
              }}
            >
              サンプルデータ
            </button>
          </div>
        </div>

        <aside className={`import-result ${parsed.state}`}>
          <h3>解析・バリデーション結果</h3>
          <p>{parsed.message}</p>
          {parsed.state === "success" && stats ? (
            <dl className="summary-list">
              <div><dt>大会名</dt><dd>{parsed.tournament.title || "無題のトーナメント"}</dd></div>
              <div><dt>参加者数</dt><dd>{stats.activeEntrantCount}</dd></div>
              <div><dt>シード指定</dt><dd>{stats.seedAssignedCount}</dd></div>
              <div><dt>BYE数</dt><dd>{stats.byeCount === undefined ? "不正" : stats.byeCount}</dd></div>
            </dl>
          ) : null}
          {parsed.state === "success" ? (
            <ValidationBanner
              errors={validation.errors}
              warnings={validation.warnings}
              entrants={parsed.tournament.entrants}
              compact
            />
          ) : null}
        </aside>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" onClick={() => navigate("/")}>一覧へ戻る</button>
        <button
          type="button"
          className="button primary"
          disabled={parsed.state !== "success" || validation.errors.length > 0}
          onClick={() => {
            if (parsed.state !== "success") {
              return;
            }

            importTournament(compactTournament(parsed.tournament));
            navigate("/");
          }}
        >
          読込実行
        </button>
      </div>
    </div>
  );
}
