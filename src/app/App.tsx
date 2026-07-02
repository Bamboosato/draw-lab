import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BasicInfoPage } from "../pages/BasicInfoPage";
import { EntrantsPage } from "../pages/EntrantsPage";
import { JsonImportPage } from "../pages/JsonImportPage";
import { OptionsPage } from "../pages/OptionsPage";
import { PreviewPage } from "../pages/PreviewPage";
import { TournamentListPage } from "../pages/TournamentListPage";
import { useTournaments } from "./TournamentProvider";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TournamentListPage />} />
        <Route path="/tournaments/new" element={<NewTournamentRoute />} />
        <Route path="/tournaments/:id/edit/basic" element={<BasicInfoPage />} />
        <Route path="/tournaments/:id/edit/entrants" element={<EntrantsPage />} />
        <Route path="/tournaments/:id/edit/options" element={<OptionsPage />} />
        <Route path="/tournaments/:id/preview" element={<PreviewPage />} />
        <Route path="/import" element={<JsonImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
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
