// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import {
  shouldUseViewTransitions,
  useViewTransitionNavigate,
  ViewTransitionRedirect,
} from "../app/viewTransitionNavigation";

const originalStartViewTransition = Object.getOwnPropertyDescriptor(document, "startViewTransition");
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

afterEach(() => {
  cleanup();
  navigateMock.mockReset();
  restoreProperty(document, "startViewTransition", originalStartViewTransition);
  restoreProperty(window, "matchMedia", originalMatchMedia);
});

describe("View Transition navigation", () => {
  it("API対応かつモーション低減なしでは画面遷移へView Transitionを指定する", () => {
    installViewTransitionSupport();
    installReducedMotionPreference(false);
    render(<NavigationButton />);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(shouldUseViewTransitions()).toBe(true);
    expect(navigateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith("/next", {
      replace: true,
      state: { source: "test" },
      viewTransition: true,
    });
  });

  it("API未対応でもView Transitionを指定せず通常遷移を継続する", () => {
    installReducedMotionPreference(false);
    render(<NavigationButton />);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(shouldUseViewTransitions()).toBe(false);
    expect(navigateMock).toHaveBeenCalledWith("/next", {
      replace: true,
      state: { source: "test" },
      viewTransition: false,
    });
  });

  it("モーション低減時はAPI対応ブラウザでもView Transitionを開始しない", () => {
    installViewTransitionSupport();
    installReducedMotionPreference(true);
    render(<NavigationButton />);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(shouldUseViewTransitions()).toBe(false);
    expect(navigateMock).toHaveBeenCalledWith("/next", {
      replace: true,
      state: { source: "test" },
      viewTransition: false,
    });
  });

  it("自動リダイレクトは再描画されても1回だけ実行する", () => {
    installViewTransitionSupport();
    installReducedMotionPreference(false);
    const state = { flowNotice: "基本情報を確認してください。" };
    const view = render(<ViewTransitionRedirect to="/basic" replace state={state} />);

    view.rerender(<ViewTransitionRedirect to="/basic" replace state={state} />);

    expect(navigateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith("/basic", {
      replace: true,
      state,
      viewTransition: true,
    });
  });
});

function NavigationButton() {
  const navigate = useViewTransitionNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/next", { replace: true, state: { source: "test" } })}
    >
      次へ
    </button>
  );
}

function installViewTransitionSupport(): void {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: vi.fn(),
  });
}

function installReducedMotionPreference(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}
