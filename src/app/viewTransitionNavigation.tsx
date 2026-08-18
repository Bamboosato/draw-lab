import { useCallback, useEffect, useRef, useState } from "react";
import {
  useNavigate,
  type NavigateOptions,
  type To,
} from "react-router-dom";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type ViewTransitionDocument = Document & {
  startViewTransition?: unknown;
};

export function shouldUseViewTransitions(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  const viewTransitionDocument = document as ViewTransitionDocument;

  return (
    typeof viewTransitionDocument.startViewTransition === "function"
    && (typeof window.matchMedia !== "function" || !window.matchMedia(REDUCED_MOTION_QUERY).matches)
  );
}

export function useViewTransitionNavigate() {
  const navigate = useNavigate();

  return useCallback((to: To, options?: NavigateOptions) => {
    navigate(to, {
      ...options,
      viewTransition: shouldUseViewTransitions(),
    });
  }, [navigate]);
}

export function useViewTransitionsEnabled(): boolean {
  const [enabled, setEnabled] = useState(shouldUseViewTransitions);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateEnabled = () => setEnabled(shouldUseViewTransitions());

    updateEnabled();
    mediaQuery.addEventListener("change", updateEnabled);

    return () => mediaQuery.removeEventListener("change", updateEnabled);
  }, []);

  return enabled;
}

export function ViewTransitionRedirect({
  replace,
  state,
  to,
}: {
  replace?: boolean;
  state?: unknown;
  to: To;
}) {
  const navigate = useViewTransitionNavigate();
  const navigationStartedRef = useRef(false);

  useEffect(() => {
    if (navigationStartedRef.current) {
      return;
    }

    navigationStartedRef.current = true;
    navigate(to, { replace, state });
  }, [navigate, replace, state, to]);

  return null;
}
