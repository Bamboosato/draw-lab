import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { downloadTournament } from "../app/tournamentPersistence";
import { useTournaments } from "../app/TournamentProvider";
import { CompactSummary } from "../components/CompactSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Tournament } from "../domain/types";

export function TournamentListPage() {
  const navigate = useNavigate();
  const { tournaments, deleteTournament, duplicateTournament } = useTournaments();
  const [deleteTargetId, setDeleteTargetId] = useState<string | undefined>();
  const deleteTarget = tournaments.find((tournament) => tournament.id === deleteTargetId);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="page-description">作成済みのトーナメントを管理・編集します。</p>
        <div className="button-row no-print">
          <Link
            className="button secondary"
            to="/import"
            title="大会情報を読込み"
            aria-label="大会情報を読込み"
          >
            読込
          </Link>
          <Link className="button primary" to="/tournaments/new" title="新しいトーナメントを作成">新規作成</Link>
        </div>
      </section>

      <CompactSummary
        ariaLabel="トーナメント概要"
        items={[
          { label: "全トーナメント", value: String(tournaments.length) },
          { label: "生成済み", value: String(tournaments.filter((item) => item.generatedDraw).length) },
          { label: "編集中", value: String(tournaments.filter((item) => !item.generatedDraw).length) },
          { label: "保存先", value: "localStorage" },
        ]}
      />

      {tournaments.length === 0 ? (
        <section className="empty-state">
          <h3>保存済みのトーナメントはありません。</h3>
          <p>新規作成または大会情報読込から開始してください。</p>
        </section>
      ) : (
        <section className="table-panel">
          <table className="data-table tournament-list-table">
            <thead>
              <tr>
                <th>大会名</th>
                <th>種目</th>
                <th>開催日</th>
                <th>サイズ</th>
                <th>状態</th>
                <th>最終更新</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => (
                <tr key={tournament.id}>
                  <td>
                    <strong title={tournament.title || "無題のトーナメント"}>{tournament.title || "無題のトーナメント"}</strong>
                    <span className="muted-line">{tournament.venue || "会場未設定"}</span>
                  </td>
                  <td
                    className="tournament-event-cell"
                    title={`${tournament.eventName || "-"}（${tournament.matchType === "doubles" ? "ダブルス" : "シングルス"}）`}
                  >
                    {tournament.eventName || "-"}
                    <span className="muted-line">（{tournament.matchType === "doubles" ? "ダブルス" : "シングルス"}）</span>
                  </td>
                  <td>{tournament.date || "-"}</td>
                  <td>{tournament.drawSize}枠</td>
                  <td><StatusBadge tournament={tournament} /></td>
                  <td>{formatDateTime(tournament.updatedAt)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" title="トーナメントを編集" onClick={() => navigate(`/tournaments/${tournament.id}/edit/basic`)}>編集</button>
                      <button
                        type="button"
                        title="生成済みトーナメント表を表示"
                        disabled={!tournament.generatedDraw}
                        onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}
                      >
                        プレビュー
                      </button>
                      <ActionMenu
                        tournament={tournament}
                        onDuplicate={() => {
                          const duplicated = duplicateTournament(tournament.id);
                          if (duplicated) {
                            navigate(`/tournaments/${duplicated.id}/edit/basic`);
                          }
                        }}
                        onExport={() => downloadTournament(tournament)}
                        onDelete={() => setDeleteTargetId(tournament.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="トーナメントを削除します"
        message={`${deleteTarget?.title || "無題のトーナメント"} を削除しますか？`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        tone="danger"
        onCancel={() => setDeleteTargetId(undefined)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteTournament(deleteTarget.id);
          }
          setDeleteTargetId(undefined);
        }}
      />
    </div>
  );
}

function ActionMenu({
  tournament,
  onDuplicate,
  onExport,
  onDelete,
}: {
  tournament: Tournament;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (
        event.target instanceof Node
        && (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target))
      ) {
        return;
      }

      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    const updateMenuPosition = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = 96;
      const left = Math.max(
        8,
        Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - 8),
      );

      setMenuPosition({ top: triggerRect.bottom + 6, left });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    updateMenuPosition();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  const toggleMenu = (): void => {
    if (!isOpen) {
      const trigger = triggerRef.current;
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const menuWidth = 96;
        const left = Math.max(
          8,
          Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - 8),
        );
        setMenuPosition({ top: triggerRect.bottom + 6, left });
      }
    }

    setIsOpen((current) => !current);
  };

  return (
    <div className="action-menu">
      <button
        type="button"
        className="action-menu-trigger"
        ref={triggerRef}
        aria-label={`${tournament.title || "大会"}のその他の操作`}
        title="その他の操作"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={toggleMenu}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {isOpen ? createPortal(
        <div
          className="action-menu-popover"
          ref={menuRef}
          role="menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            type="button"
            role="menuitem"
            title="トーナメントを複製"
            aria-label="トーナメントを複製"
            onClick={() => {
              setIsOpen(false);
              onDuplicate();
            }}
          >
            複製
          </button>
          <button
            type="button"
            role="menuitem"
            title="大会情報をJSON出力"
            aria-label="大会情報をJSON出力"
            onClick={() => {
              setIsOpen(false);
              onExport();
            }}
          >
            出力
          </button>
          <button
            type="button"
            role="menuitem"
            title="トーナメントを削除"
            aria-label="トーナメントを削除"
            className="danger"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
          >
            削除
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function StatusBadge({ tournament }: { tournament: Tournament }) {
  return <span className={`status-badge ${tournament.generatedDraw ? "generated" : "draft"}`}>{tournament.generatedDraw ? "生成済" : "未生成"}</span>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
