import { useParams } from "react-router-dom";
import { ViewTransitionRedirect } from "../app/viewTransitionNavigation";

/**
 * Compatibility redirect for links saved before selection was integrated into
 * the participant list.
 */
export function LeagueSelectionPage() {
  const { id } = useParams();
  return <ViewTransitionRedirect to={id ? `/leagues/${id}/edit/participants` : "/leagues"} replace />;
}
