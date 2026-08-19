import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  getTournamentStepFromPath,
  TOURNAMENT_STEPS,
  type TournamentStep,
} from "../app/tournamentFlow";
import { useViewTransitionsEnabled } from "../app/viewTransitionNavigation";
import { PwaStatus } from "./PwaStatus";

export function AppShell({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const screenName = getScreenName(location.pathname);
  const showStepper = location.pathname.includes("/tournaments/") && location.pathname !== "/tournaments/new";
  const tournamentId = getTournamentId(location.pathname);
  const currentStep = getTournamentStepFromPath(location.pathname);
  const flowNotice = getFlowNotice(location.state);
  const isTournamentArea = isTournamentPath(location.pathname);
  const viewTransitionsEnabled = useViewTransitionsEnabled();

  return (
    <div className={isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar no-print">
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={isSidebarCollapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
            title={isSidebarCollapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
            aria-expanded={!isSidebarCollapsed}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <SidebarToggleIcon isCollapsed={isSidebarCollapsed} />
          </button>
          <div className="brand">
            <strong>DrawLab</strong>
          </div>
        </div>
        <nav className="nav-list" aria-label="グローバルナビゲーション">
          <NavLink
            to="/"
            className={isTournamentArea ? "active" : undefined}
            viewTransition={viewTransitionsEnabled}
          >
            トーナメント
          </NavLink>
          <span className="nav-disabled" aria-disabled="true">
            <span>リーグ表</span>
            <span className="nav-badge">未実装</span>
          </span>
        </nav>
      </aside>
      <div className="main-area">
        {showStepper && tournamentId ? (
          <div className="stepper-band no-print">
            <TournamentStepper currentStep={currentStep} />
          </div>
        ) : (
          <header className="topbar no-print">
            <div>
              <p className="eyebrow">DrawLab Tournament Manager</p>
              <h1>{screenName}</h1>
            </div>
          </header>
        )}
        {flowNotice ? (
          <div className="flow-notice no-print" role="status">
            {flowNotice}
          </div>
        ) : null}
        <PwaStatus />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function TournamentStepper({ currentStep }: { currentStep: TournamentStep | undefined }) {
  const currentStepIndex = TOURNAMENT_STEPS.findIndex((step) => step.key === currentStep);

  return (
    <ol className="stepper" aria-label="作成フロー">
      {TOURNAMENT_STEPS.map((step, index) => {
        const isActive = currentStep === step.key;
        const isComplete = currentStepIndex >= 0 && index < currentStepIndex;
        const className = getStepperItemClassName(step.key, isActive, isComplete);

        return (
          <li
            key={step.key}
            className={className}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${index + 1}. ${step.label}${isActive ? "（現在）" : isComplete ? "（完了）" : "（未到達）"}`}
          >
            <span className="stepper-step">
              <span className="step-number">{isComplete ? "✓" : index + 1}</span>
              <span className="step-label">{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function getScreenName(pathname: string): string {
  if (pathname === "/") {
    return "トーナメント";
  }

  if (pathname === "/import") {
    return "大会情報の復元";
  }

  if (pathname.includes("/entrants")) {
    return "名簿入力";
  }

  if (pathname.includes("/options")) {
    return "オプション設定";
  }

  if (pathname.includes("/preview")) {
    return "プレビュー";
  }

  return "基本情報";
}

function getStepperItemClassName(step: TournamentStep, isActive: boolean, isComplete: boolean): string {
  return [
    "stepper-item",
    `stepper-${step}`,
    isActive ? "active" : "",
    !isActive && isComplete ? "complete" : "",
    !isActive && !isComplete ? "upcoming" : "",
  ].filter(Boolean).join(" ");
}

function getFlowNotice(state: unknown): string | undefined {
  if (!state || typeof state !== "object" || !("flowNotice" in state)) {
    return undefined;
  }

  const flowNotice = (state as { flowNotice?: unknown }).flowNotice;
  return typeof flowNotice === "string" ? flowNotice : undefined;
}

function getTournamentId(pathname: string): string | undefined {
  const match = pathname.match(/^\/tournaments\/([^/]+)/);
  return match?.[1] === "new" ? undefined : match?.[1];
}

function isTournamentPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/import" || pathname.startsWith("/tournaments/");
}

function SidebarToggleIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg
      className="sidebar-toggle-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      <path d="M7.5 4V16" />
      <path d={isCollapsed ? "M10 7L13 10L10 13" : "M13 7L10 10L13 13"} />
    </svg>
  );
}
