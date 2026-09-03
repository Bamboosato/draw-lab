import { type ReactNode, useEffect, useRef } from "react";
import { Outlet, useLocation, useParams, type RouteObject } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BasicInfoPage } from "../pages/BasicInfoPage";
import { EntrantsPage } from "../pages/EntrantsPage";
import { JsonImportPage } from "../pages/JsonImportPage";
import { OptionsPage } from "../pages/OptionsPage";
import { PreviewPage } from "../pages/PreviewPage";
import { TournamentMatchesPage } from "../pages/TournamentMatchesPage";
import { TournamentListPage } from "../pages/TournamentListPage";
import { LeagueBasicInfoPage } from "../pages/LeagueBasicInfoPage";
import { LeagueDashboardPage } from "../pages/LeagueDashboardPage";
import { LeagueGroupsPage } from "../pages/LeagueGroupsPage";
import { LeagueJsonImportPage } from "../pages/LeagueJsonImportPage";
import { LeagueListPage } from "../pages/LeagueListPage";
import { LeagueMatchesPage } from "../pages/LeagueMatchesPage";
import { LeagueParticipantsPage } from "../pages/LeagueParticipantsPage";
import { HomePage } from "../pages/HomePage";
import {
  getTournamentStepAccess,
  getTournamentStepPath,
  type TournamentStep,
} from "./tournamentFlow";
import { TournamentProvider, useTournament, useTournaments } from "./TournamentProvider";
import { LeagueProvider, useLeague, useLeagues } from "./LeagueProvider";
import { getLeagueStepAccess, getLeagueStepPath, type LeagueStep } from "./leagueFlow";
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
        <LeagueProvider>
          <App />
        </LeagueProvider>
      </TournamentProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: "tournaments", element: <TournamentListPage /> },
      { path: "tournaments/new", element: <NewTournamentRoute /> },
      { path: "tournaments/:id/edit/basic", element: <GuardedTournamentStep step="basic"><BasicInfoPage /></GuardedTournamentStep> },
      {
        path: "tournaments/:id/edit/entrants",
        element: <GuardedTournamentStep step="entrants"><EntrantsPage /></GuardedTournamentStep>,
      },
      {
        path: "tournaments/:id/edit/options",
        element: <GuardedTournamentStep step="options"><OptionsPage /></GuardedTournamentStep>,
      },
      {
        path: "tournaments/:id/edit/matches",
        element: <GuardedTournamentStep step="matches"><TournamentMatchesPage /></GuardedTournamentStep>,
      },
      {
        path: "tournaments/:id/preview",
        element: <GuardedTournamentStep step="preview"><PreviewPage /></GuardedTournamentStep>,
      },
      { path: "tournaments/import", element: <JsonImportPage /> },
      { path: "import", element: <ViewTransitionRedirect to="/tournaments/import" replace /> },
      { path: "leagues", element: <LeagueListPage /> },
      { path: "leagues/new", element: <NewLeagueRoute /> },
      { path: "leagues/import", element: <LeagueJsonImportPage /> },
      { path: "leagues/:id/edit/basic", element: <GuardedLeagueStep step="basic"><LeagueBasicInfoPage /></GuardedLeagueStep> },
      {
        path: "leagues/:id/edit/participants",
        element: <GuardedLeagueStep step="participants"><LeagueParticipantsPage /></GuardedLeagueStep>,
      },
      {
        path: "leagues/:id/edit/selection",
        element: <LegacyLeagueSelectionRoute />,
      },
      {
        path: "leagues/:id/edit/groups",
        element: <GuardedLeagueStep step="groups"><LeagueGroupsPage /></GuardedLeagueStep>,
      },
      {
        path: "leagues/:id/edit/matches",
        element: <GuardedLeagueStep step="matches"><LeagueMatchesPage /></GuardedLeagueStep>,
      },
      {
        path: "leagues/:id/dashboard",
        element: <GuardedLeagueStep step="dashboard"><LeagueDashboardPage /></GuardedLeagueStep>,
      },
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
  const { getTournamentIntegration } = useTournaments();

  if (!tournament) {
    return children;
  }

  const access = getTournamentStepAccess(tournament, step, getTournamentIntegration(tournament.id));

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

function LegacyLeagueSelectionRoute() {
  const { id } = useParams();
  return <ViewTransitionRedirect to={id ? `/leagues/${id}/edit/participants` : "/leagues"} replace />;
}

function GuardedLeagueStep({ children, step }: { children: ReactNode; step: LeagueStep }) {
  const { id } = useParams();
  const location = useLocation();
  const league = useLeague(id);

  if (!league) return children;
  const access = getLeagueStepAccess(league, step);
  if (!access.canEnter) {
    return (
      <ViewTransitionRedirect
        to={getLeagueStepPath(league.id, access.redirectStep ?? "basic")}
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

function NewLeagueRoute() {
  const navigate = useViewTransitionNavigate();
  const { createLeague, storageError, storageStatus } = useLeagues();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || storageStatus !== "ready") return;
    createdRef.current = true;
    const league = createLeague();
    navigate(`/leagues/${league.id}/edit/basic`, { replace: true });
  }, [createLeague, navigate, storageStatus]);

  if (storageStatus === "error") {
    return <div className="loading-panel">{storageError || "保存領域を準備できませんでした。"}</div>;
  }
  return <div className="loading-panel">新規リーグを作成しています。</div>;
}
