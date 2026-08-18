import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useViewTransitionNavigate } from "../app/viewTransitionNavigation";
import { getOverflowMenuPosition, type OverflowMenuPosition } from "../app/overflowMenuPosition";
import {
  getTournamentEditSteps,
  getTournamentStepPath,
  type TournamentEditStep,
} from "../app/tournamentFlow";
import {
  DEFAULT_TOURNAMENT_SORT,
  getNextTournamentSort,
  sortTournaments,
  type TournamentSort,
  type TournamentSortKey,
} from "../app/tournamentListSort";
import { downloadAllTournaments, downloadTournament } from "../app/tournamentPersistence";
import { isTournamentDrawCurrent } from "../app/tournamentModel";
import { useTournaments } from "../app/TournamentProvider";
import { CompactSummary } from "../components/CompactSummary";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Tournament } from "../domain/types";

export function TournamentListPage() {
  const navigate = useViewTransitionNavigate();
  const {
    createTournament,
    deleteTournament,
    duplicateTournament,
    storageError,
    storageStatus,
    tournaments,
  } = useTournaments();
  const [deleteTargetId, setDeleteTargetId] = useState<string | undefined>();
  const [sort, setSort] = useState<TournamentSort>(DEFAULT_TOURNAMENT_SORT);
  const deleteTarget = tournaments.find((tournament) => tournament.id === deleteTargetId);
  const sortedTournaments = useMemo(() => sortTournaments(tournaments, sort), [sort, tournaments]);
  const storageReady = storageStatus === "ready";

  return (
    <div className="page-stack tournament-list-page">
      <section className="page-heading">
        <p className="page-description">作成済みのトーナメントを管理・編集します。</p>
        <div className="button-row no-print">
          <button
            type="button"
            className="button primary"
            title="新しいトーナメントを作成"
            disabled={!storageReady}
            onClick={() => {
              const tournament = createTournament();
              navigate(`/tournaments/${tournament.id}/edit/basic`);
            }}
          >
            新規作成
          </button>
          <OverflowMenu
            triggerLabel="トーナメント一覧のその他の操作"
            disabled={!storageReady}
            menuWidth={264}
            sections={[
              {
                label: "バックアップ",
                items: [
                  {
                    label: "全大会バックアップ",
                    title: "全大会をJSONファイルへバックアップ",
                    icon: "backup",
                    disabled: tournaments.length === 0,
                    onSelect: () => downloadAllTournaments(tournaments),
                  },
                ],
              },
              {
                label: "復元",
                items: [
                  {
                    label: "大会情報の復元",
                    title: "大会情報をJSONから復元",
                    icon: "restore",
                    onSelect: () => navigate("/import"),
                  },
                ],
              },
            ]}
          />
        </div>
      </section>

      <CompactSummary
        ariaLabel="トーナメント概要"
        items={[
          { label: "全トーナメント", value: String(tournaments.length) },
          { label: "生成済み", value: String(tournaments.filter(isTournamentDrawCurrent).length) },
          { label: "編集中", value: String(tournaments.filter((item) => !isTournamentDrawCurrent(item)).length) },
          { label: "保存先", value: "IndexedDB" },
        ]}
      />

      {storageStatus === "saving" ? (
        <p className="storage-status" role="status">IndexedDBへ自動保存しています。</p>
      ) : null}

      {storageStatus === "error" ? (
        <section className="import-result error" role="alert">
          <h3>ローカル保存を利用できません</h3>
          <p>{storageError || "IndexedDBの読み書きに失敗しました。ページを再読み込みしてください。"}</p>
        </section>
      ) : null}

      {storageStatus === "loading" ? (
        <section className="empty-state" aria-busy="true">
          <h3>保存済みデータを読み込んでいます。</h3>
          <p>IndexedDBと旧localStorageデータを確認しています。</p>
        </section>
      ) : tournaments.length === 0 ? (
        <section className="empty-state">
          <h3>保存済みのトーナメントはありません。</h3>
          <p>新規作成または大会情報の復元から開始してください。</p>
        </section>
      ) : (
        <section className="table-panel">
          <table className="data-table tournament-list-table">
            <thead>
              <tr>
                <th scope="col">大会名</th>
                <th scope="col">種目</th>
                <SortableHeader
                  label="開催日"
                  sortKey="date"
                  sort={sort}
                  ascendingLabel="近い順"
                  descendingLabel="遠い順"
                  onSort={setSort}
                />
                <th scope="col">サイズ</th>
                <th scope="col">状態</th>
                <SortableHeader
                  label="最終更新"
                  sortKey="updatedAt"
                  sort={sort}
                  ascendingLabel="古い順"
                  descendingLabel="新しい順"
                  onSort={setSort}
                />
                <th scope="col">アクション</th>
              </tr>
            </thead>
            <tbody>
              {sortedTournaments.map((tournament) => {
                const drawCurrent = isTournamentDrawCurrent(tournament);

                return <tr key={tournament.id}>
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
                      <TournamentEditAction
                        tournament={tournament}
                        onSelect={(step) => navigate(getTournamentStepPath(tournament.id, step))}
                      />
                      <button
                        type="button"
                        title={drawCurrent
                          ? "生成済みトーナメント表を表示"
                          : "トーナメント表が未生成のためプレビューできません"}
                        disabled={!drawCurrent}
                        onClick={() => navigate(`/tournaments/${tournament.id}/preview`)}
                      >
                        プレビュー
                      </button>
                      <ActionMenu
                        tournament={tournament}
                        onDuplicate={() => {
                          void duplicateTournament(tournament.id).then((duplicated) => {
                            if (duplicated) {
                              navigate(`/tournaments/${duplicated.id}/edit/basic`);
                            }
                          });
                        }}
                        onExport={() => downloadTournament(tournament)}
                        onDelete={() => setDeleteTargetId(tournament.id)}
                      />
                    </div>
                  </td>
                </tr>;
              })}
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

function SortableHeader({
  label,
  sortKey,
  sort,
  ascendingLabel,
  descendingLabel,
  onSort,
}: {
  label: string;
  sortKey: TournamentSortKey;
  sort: TournamentSort;
  ascendingLabel: string;
  descendingLabel: string;
  onSort: (sort: TournamentSort) => void;
}) {
  const active = sort.key === sortKey;
  const nextSort = getNextTournamentSort(sort, sortKey);
  const nextDirectionLabel = nextSort.direction === "asc" ? ascendingLabel : descendingLabel;
  const sortLabel = `${label}を${nextDirectionLabel}に並び替え`;
  const icon = active ? (sort.direction === "asc" ? "▲" : "▼") : "⇅";

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="table-sort-button"
        title={sortLabel}
        aria-label={sortLabel}
        onClick={() => onSort(nextSort)}
      >
        <span>{label}</span>
        <span className={`table-sort-icon${active ? " active" : ""}`} aria-hidden="true">{icon}</span>
      </button>
    </th>
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
  return (
    <OverflowMenu
      triggerLabel={`${tournament.title || "大会"}のその他の操作`}
      menuWidth={160}
      sections={[
        {
          label: "大会情報",
          items: [
            {
              label: "複製",
              title: "大会情報(個別)を複製",
              icon: "duplicate",
              onSelect: onDuplicate,
            },
            {
              label: "出力",
              title: "大会情報(個別)をJSONへ出力",
              icon: "export",
              onSelect: onExport,
            },
            {
              label: "削除",
              title: "大会情報(個別)を削除",
              icon: "delete",
              danger: true,
              dividerBefore: true,
              onSelect: onDelete,
            },
          ],
        },
      ]}
    />
  );
}

function TournamentEditAction({
  tournament,
  onSelect,
}: {
  tournament: Tournament;
  onSelect: (step: TournamentEditStep) => void;
}) {
  const editSteps = getTournamentEditSteps(tournament);

  if (editSteps.length === 1) {
    return (
      <button type="button" title="基本情報を編集" onClick={() => onSelect("basic")}>
        編集
      </button>
    );
  }

  return (
    <OverflowMenu
      triggerLabel={`${tournament.title || "大会"}の編集画面を選択`}
      triggerTitle="編集画面を選択"
      triggerText="編集"
      menuWidth={176}
      sections={[
        {
          label: "編集画面",
          items: editSteps.map((step) => ({
            ...getEditStepMenuPresentation(step),
            onSelect: () => onSelect(step),
          })),
        },
      ]}
    />
  );
}

function getEditStepMenuPresentation(step: TournamentEditStep): Pick<OverflowMenuItem, "label" | "title" | "icon"> {
  switch (step) {
    case "basic":
      return { label: "基本情報", title: "基本情報を編集", icon: "basic" };
    case "entrants":
      return { label: "名簿入力", title: "名簿入力を編集", icon: "entrants" };
    case "options":
      return { label: "オプション設定", title: "オプション設定を編集", icon: "options" };
  }
}

type MenuIconName = "backup" | "restore" | "duplicate" | "export" | "delete" | "basic" | "entrants" | "options";

type OverflowMenuItem = {
  label: string;
  title: string;
  icon: MenuIconName;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
};

type OverflowMenuSection = {
  label: string;
  items: OverflowMenuItem[];
};

function OverflowMenu({
  triggerLabel,
  triggerTitle = "その他の操作",
  triggerText,
  sections,
  disabled = false,
  menuWidth,
}: {
  triggerLabel: string;
  triggerTitle?: string;
  triggerText?: string;
  sections: OverflowMenuSection[];
  disabled?: boolean;
  menuWidth: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<OverflowMenuPosition>({
    top: 0,
    left: 0,
    placement: "below",
  });
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
      const menu = menuRef.current;
      if (!trigger || !menu) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      setMenuPosition(getOverflowMenuPosition({
        trigger: triggerRect,
        menuWidth: menuRect.width,
        menuHeight: menuRect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateMenuPosition);
    if (menuRef.current) {
      resizeObserver?.observe(menuRef.current);
    }
    updateMenuPosition();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, menuWidth]);

  const toggleMenu = (): void => {
    if (!isOpen) {
      const trigger = triggerRef.current;
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const left = Math.max(
          8,
          Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - 8),
        );
        setMenuPosition({ top: triggerRect.bottom + 6, left, placement: "below" });
      }
    }

    setIsOpen((current) => !current);
  };

  return (
    <div className="action-menu">
      <button
        type="button"
        className={`action-menu-trigger${triggerText ? " action-menu-trigger-text" : ""}`}
        ref={triggerRef}
        aria-label={triggerLabel}
        title={triggerTitle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={toggleMenu}
      >
        {triggerText ? <span>{triggerText}</span> : <span aria-hidden="true">⋯</span>}
      </button>
      {isOpen ? createPortal(
        <div
          className="action-menu-popover"
          ref={menuRef}
          role="menu"
          aria-label={triggerLabel}
          data-placement={menuPosition.placement}
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuWidth }}
        >
          {sections.map((section) => (
            <div className="action-menu-section" role="group" aria-label={section.label} key={section.label}>
              <span className="action-menu-section-label">{section.label}</span>
              {section.items.map((item) => (
                <button
                  type="button"
                  role="menuitem"
                  title={item.title}
                  aria-label={item.title}
                  disabled={item.disabled}
                  className={[
                    item.danger ? "danger" : "",
                    item.dividerBefore ? "menu-item-divider" : "",
                  ].filter(Boolean).join(" ") || undefined}
                  key={item.label}
                  onClick={() => {
                    setIsOpen(false);
                    item.onSelect();
                  }}
                >
                  <MenuIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function MenuIcon({ name }: { name: MenuIconName }) {
  const paths: Record<MenuIconName, string[]> = {
    backup: ["M10 3v8", "M7 8l3 3 3-3", "M4 12v4h12v-4"],
    restore: ["M10 13V5", "M7 8l3-3 3 3", "M4 14v2h12v-2"],
    duplicate: ["M7 6V4h9v9h-2", "M4 7h9v9H4z"],
    export: ["M5 3h7l3 3v5", "M12 3v4h3", "M5 3v14h8", "M11 13h6", "M14 10l3 3-3 3"],
    delete: ["M4 6h12", "M8 3h4l1 3H7z", "M6 6l1 11h6l1-11", "M9 9v5", "M11 9v5"],
    basic: ["M5 3h7l3 3v11H5z", "M12 3v4h3", "M8 11h4", "M8 14h4"],
    entrants: ["M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M2.5 17c.4-3 2-5 4.5-5s4.1 2 4.5 5", "M13 6a2.5 2.5 0 0 1 0 5", "M13 13c2.2 0 3.8 1.4 4.3 4"],
    options: ["M4 5h12", "M4 10h12", "M4 15h12", "M7 3v4", "M13 8v4", "M9 13v4"],
  };

  return (
    <svg className="action-menu-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {paths[name].map((path) => <path d={path} key={path} />)}
    </svg>
  );
}

function StatusBadge({ tournament }: { tournament: Tournament }) {
  const drawCurrent = isTournamentDrawCurrent(tournament);
  const label = drawCurrent ? "生成済" : "未生成";

  return <span className={`status-badge ${drawCurrent ? "generated" : "draft"}`}>{label}</span>;
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
