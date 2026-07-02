import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

const stepItems = [
  { key: "basic", label: "基本情報", path: "edit/basic" },
  { key: "entrants", label: "名簿入力", path: "edit/entrants" },
  { key: "options", label: "生成オプション", path: "edit/options" },
  { key: "preview", label: "プレビュー", path: "preview" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const screenName = getScreenName(location.pathname);
  const showStepper = location.pathname.includes("/tournaments/") && location.pathname !== "/tournaments/new";
  const tournamentId = getTournamentId(location.pathname);

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <img className="brand-mark" src="/draw-lab-icon.png" alt="" aria-hidden="true" />
          <div>
            <strong>DrawLab</strong>
            <span>PoC / ローカル保存</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="グローバルナビゲーション">
          <NavLink to="/" end>
            一覧
          </NavLink>
          <NavLink to="/import">JSONインポート</NavLink>
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar no-print">
          <div>
            <p className="eyebrow">DrawLab Tournament Manager</p>
            <h1>{screenName}</h1>
          </div>
          <NavLink className="text-link" to="/">
            一覧へ戻る
          </NavLink>
        </header>
        {showStepper && tournamentId ? (
          <nav className="stepper no-print" aria-label="作成フロー">
            {stepItems.map((step, index) => (
              <NavLink
                key={step.key}
                to={`/tournaments/${tournamentId}/${step.path}`}
                className={location.pathname.includes(step.key) || location.pathname.endsWith(step.path) ? "active" : ""}
              >
                <span>{index + 1}</span>
                {step.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function getScreenName(pathname: string): string {
  if (pathname === "/") {
    return "一覧";
  }

  if (pathname === "/import") {
    return "JSONインポート";
  }

  if (pathname.includes("/entrants")) {
    return "名簿入力";
  }

  if (pathname.includes("/options")) {
    return "生成オプション";
  }

  if (pathname.includes("/preview")) {
    return "プレビュー";
  }

  return "基本情報";
}

function getTournamentId(pathname: string): string | undefined {
  const match = pathname.match(/^\/tournaments\/([^/]+)/);
  return match?.[1] === "new" ? undefined : match?.[1];
}
