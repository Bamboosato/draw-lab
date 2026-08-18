import { type ReactNode, useEffect, useRef } from "react";
import { Outlet, useLocation, useParams, type RouteObject } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BasicInfoPage } from "../pages/BasicInfoPage";
import { EntrantsPage } from "../pages/EntrantsPage";
import { JsonImportPage } from "../pages/JsonImportPage";
import { OptionsPage } from "../pages/OptionsPage";
import { PreviewPage } from "../pages/PreviewPage";
import { TournamentListPage } from "../pages/TournamentListPage";
import {
  getTournamentStepAccess,
  getTournamentStepPath,
  type TournamentStep,
} from "./tournamentFlow";
import { TournamentProvider, useTournament, useTournaments } from "./TournamentProvider";
import {
  useViewTransitionNavigate,
  ViewTransitionRedirect,
} from "./viewTransitionNavigation";

export function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: (
      <TournamentProvider>
        <App />
      </TournamentProvider>
    ),
    children: [
      { index: true, element: <TournamentListPage /> },
      { path: "tournaments/new", element: <NewTournamentRoute /> },
      { path: "tournaments/:id/edit/basic", element: <BasicInfoPage /> },
      {
        path: "tournaments/:id/edit/entrants",
        element: <GuardedTournamentStep step="entrants"><EntrantsPage /></GuardedTournamentStep>,
      },
      {
        path: "tournaments/:id/edit/options",
        element: <GuardedTournamentStep step="options"><OptionsPage /></GuardedTournamentStep>,
      },
      {
        path: "tournaments/:id/preview",
        element: <GuardedTournamentStep step="preview"><PreviewPage /></GuardedTournamentStep>,
      },
      { path: "import", element: <JsonImportPage /> },
      { path: "*", element: <ViewTransitionRedirect to="/" replace /> },
    ],
  },
];

function GuardedTournamentStep({
  children,
  step,
}: {
  children: ReactNode;
  step: TournamentStep;
}) {
  const { id } = useParams();
  const location = useLocation();
  const tournament = useTournament(id);

  if (!tournament) {
    return children;
  }

  const access = getTournamentStepAccess(tournament, step);

  if (!access.canEnter) {
    const redirectStep = access.redirectStep ?? "basic";

    return (
      <ViewTransitionRedirect
        to={getTournamentStepPath(tournament.id, redirectStep)}
        replace
        state={{ flowNotice: access.reason, from: location.pathname }}
      />
    );
  }

  return children;
}

function NewTournamentRoute() {
  const navigate = useViewTransitionNavigate();
  const params = useParams();
  const { createTournament, storageError, storageStatus } = useTournaments();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || params.id || storageStatus !== "ready") {
      return;
    }

    createdRef.current = true;
    const tournament = createTournament();
    navigate(`/tournaments/${tournament.id}/edit/basic`, { replace: true });
  }, [createTournament, navigate, params.id, storageStatus]);

  if (params.id) {
    return <ViewTransitionRedirect to={`/tournaments/${params.id}/edit/basic`} replace />;
  }

  if (storageStatus === "error") {
    return <div className="loading-panel">{storageError || "保存領域を準備できませんでした。"}</div>;
  }

  return <div className="loading-panel">新規トーナメントを作成しています。</div>;
}
