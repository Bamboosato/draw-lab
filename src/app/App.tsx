import { type ReactNode, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useTournament, useTournaments } from "./TournamentProvider";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TournamentListPage />} />
        <Route path="/tournaments/new" element={<NewTournamentRoute />} />
        <Route path="/tournaments/:id/edit/basic" element={<BasicInfoPage />} />
        <Route
          path="/tournaments/:id/edit/entrants"
          element={<GuardedTournamentStep step="entrants"><EntrantsPage /></GuardedTournamentStep>}
        />
        <Route
          path="/tournaments/:id/edit/options"
          element={<GuardedTournamentStep step="options"><OptionsPage /></GuardedTournamentStep>}
        />
        <Route
          path="/tournaments/:id/preview"
          element={<GuardedTournamentStep step="preview"><PreviewPage /></GuardedTournamentStep>}
        />
        <Route path="/import" element={<JsonImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

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
      <Navigate
        to={getTournamentStepPath(tournament.id, redirectStep)}
        replace
        state={{ flowNotice: access.reason, from: location.pathname }}
      />
    );
  }

  return children;
}

function NewTournamentRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const { createTournament } = useTournaments();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || params.id) {
      return;
    }

    createdRef.current = true;
    const tournament = createTournament();
    navigate(`/tournaments/${tournament.id}/edit/basic`, { replace: true });
  }, [createTournament, navigate, params.id]);

  if (params.id) {
    return <Navigate to={`/tournaments/${params.id}/edit/basic`} replace />;
  }

  return <div className="loading-panel">新規トーナメントを作成しています。</div>;
}
