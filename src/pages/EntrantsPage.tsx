import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  compactTournament,
  createEmptyEntrant,
  ensureEntrantRows,
  getEntrantStats,
  parseEntrantsFromText,
  validateTournamentForUi,
} from "../app/tournamentModel";
import { useTournament, useTournaments } from "../app/TournamentProvider";
import { ValidationBanner } from "../components/ValidationBanner";
import type { Entrant } from "../domain/types";

export function EntrantsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tournament = useTournament(id);
  const { updateTournament } = useTournaments();
  const [pasteText, setPasteText] = useState("");
  const [checked, setChecked] = useState(false);

  const validation = useMemo(() => tournament ? validateTournamentForUi(tournament) : { errors: [], warnings: [] }, [tournament]);
  const stats = useMemo(() => tournament ? getEntrantStats(tournament) : undefined, [tournament]);

  if (!tournament) {
    return <section className="empty-state"><h2>トーナメントが見つかりません。</h2></section>;
  }

  const rows = ensureEntrantRows(tournament.entrants, tournament.drawSize, tournament.matchType);

  const updateEntrants = (entrants: Entrant[]): void => {
    updateTournament({ ...tournament, entrants, generatedDraw: undefined });
  };

  const updateEntrant = (entrantId: string, patch: Partial<Entrant>): void => {
    updateEntrants(rows.map((entrant) => entrant.id === entrantId ? { ...entrant, ...patch } : entrant));
  };

  const goNext = (): void => {
    setChecked(true);

    if (validation.errors.length > 0) {
      return;
    }

    if (validation.warnings.length > 0 && !window.confirm("警告があります。内容を確認したうえで次へ進みますか？")) {
      return;
    }

    updateTournament(compactTournament(tournament));
    navigate(`/tournaments/${tournament.id}/edit/options`);
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Roster Entry</p>
          <h2>名簿入力</h2>
          <p>ExcelまたはスプレッドシートからのTSV/CSV貼り付けにも対応します。</p>
        </div>
        <div className="button-row no-print">
          <button type="button" className="button secondary" onClick={() => updateEntrants([...rows, createEmptyEntrant(rows.length + 1, tournament.matchType)])}>行追加</button>
          <button type="button" className="button secondary" onClick={() => updateTournament(compactTournament(tournament))}>空行削除</button>
          <button type="button" className="button secondary" onClick={() => setChecked(true)}>入力チェック</button>
        </div>
      </section>

      {stats ? (
        <section className="summary-grid">
          <Metric label="有効参加者数" value={String(stats.activeEntrantCount)} />
          <Metric label="ドローサイズ" value={`${tournament.drawSize}枠`} />
          <Metric label="BYE数" value={stats.byeCount === undefined ? "不正" : String(stats.byeCount)} />
          <Metric label="シード指定" value={String(stats.seedAssignedCount)} />
        </section>
      ) : null}

      {checked ? <ValidationBanner errors={validation.errors} warnings={validation.warnings} /> : null}

      <section className="table-panel roster-panel">
        <table className="data-table roster-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>シード</th>
              <th>{tournament.matchType === "doubles" ? "選手名1" : "選手名"}</th>
              {tournament.matchType === "doubles" ? <th>選手名2</th> : null}
              <th>{tournament.matchType === "doubles" ? "所属チーム1" : "所属チーム"}</th>
              {tournament.matchType === "doubles" ? <th>所属チーム2</th> : null}
              {tournament.matchType === "doubles" ? <th>同チーム扱い</th> : null}
              <th>地区</th>
              <th>ランキング</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entrant, index) => (
              <tr key={entrant.id}>
                <td className="row-number">{index + 1}</td>
                <td>
                  <input
                    className="short-input"
                    value={entrant.seedNo ?? ""}
                    onChange={(event) => updateEntrant(entrant.id, { seedNo: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={entrant.player1Name}
                    onChange={(event) => updateEntrant(entrant.id, { player1Name: event.target.value })}
                  />
                </td>
                {tournament.matchType === "doubles" ? (
                  <td>
                    <input
                      value={entrant.player2Name ?? ""}
                      onChange={(event) => updateEntrant(entrant.id, { player2Name: event.target.value })}
                    />
                  </td>
                ) : null}
                <td>
                  <input value={entrant.team1 ?? ""} onChange={(event) => updateEntrant(entrant.id, { team1: event.target.value })} />
                </td>
                {tournament.matchType === "doubles" ? (
                  <td>
                    <input value={entrant.team2 ?? ""} onChange={(event) => updateEntrant(entrant.id, { team2: event.target.value })} />
                  </td>
                ) : null}
                {tournament.matchType === "doubles" ? (
                  <td>
                    <input
                      className="short-input"
                      maxLength={5}
                      value={entrant.sameTeamGroup ?? ""}
                      onChange={(event) => updateEntrant(entrant.id, { sameTeamGroup: event.target.value })}
                    />
                  </td>
                ) : null}
                <td>
                  <input value={entrant.region ?? ""} onChange={(event) => updateEntrant(entrant.id, { region: event.target.value })} />
                </td>
                <td>
                  <input value={entrant.ranking ?? ""} onChange={(event) => updateEntrant(entrant.id, { ranking: event.target.value })} />
                </td>
                <td>
                  <button type="button" className="danger-link" onClick={() => updateEntrants(rows.filter((item) => item.id !== entrant.id))}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="paste-panel no-print">
        <label className="field">
          <span>TSV/CSV貼り付け</span>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={tournament.matchType === "doubles"
              ? "No, シード, 選手名1, 選手名2, 所属チーム1, 所属チーム2, 同チーム扱い, 地区, ランキング"
              : "No, シード, 選手名, 所属チーム, 地区, ランキング"}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const parsed = parseEntrantsFromText(pasteText, tournament.matchType);
              updateEntrants([...compactTournament(tournament).entrants, ...parsed]);
              setPasteText("");
              setChecked(true);
            }}
          >
            貼り付けを取り込み
          </button>
        </div>
      </section>

      <div className="bottom-actions no-print">
        <button type="button" className="button secondary" onClick={() => navigate(`/tournaments/${tournament.id}/edit/basic`)}>戻る（基本情報へ）</button>
        <button type="button" className="button secondary" onClick={() => updateTournament(tournament)}>一時保存</button>
        <button type="button" className="button primary" onClick={goNext}>次へ（生成オプションへ）</button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
