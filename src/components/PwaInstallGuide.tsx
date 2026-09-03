import { useCallback, useEffect, useId, useRef, useState } from "react";

const INSTALL_GUIDE_DISMISSED_UNTIL_KEY = "drawlab:pwa-install-guide-dismissed-until";
const INSTALL_GUIDE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

export type InstallGuideMode = "hidden" | "browserInstall" | "iosManual" | "unsupported";

export type InstallGuideState = {
  mode: InstallGuideMode;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
};

let sessionDismissedUntil = 0;

export function usePwaInstallGuide(): InstallGuideState {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | undefined>(undefined);
  const [mode, setMode] = useState<InstallGuideMode>(() => getInitialInstallGuideMode());

  useEffect(() => {
    if (isStandaloneMode() || isInstallGuideSuppressed()) {
      setMode("hidden");
      return undefined;
    }

    const handleBeforeInstallPrompt = (event: Event): void => {
      if (isStandaloneMode() || isInstallGuideSuppressed()) {
        return;
      }

      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setMode("browserInstall");
    };
    const handleAppInstalled = (): void => {
      deferredPromptRef.current = undefined;
      setMode("hidden");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (isIosDevice()) {
      setMode("iosManual");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<void> => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) {
      return;
    }

    deferredPromptRef.current = undefined;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        suppressInstallGuide();
      }
      setMode("hidden");
    } catch {
      setMode("unsupported");
    }
  }, []);

  const dismiss = useCallback((): void => {
    deferredPromptRef.current = undefined;
    suppressInstallGuide();
    setMode("hidden");
  }, []);

  return { mode, promptInstall, dismiss };
}

export function PwaInstallGuide() {
  const { mode, promptInstall, dismiss } = usePwaInstallGuide();
  const [isInstructionsOpen, setInstructionsOpen] = useState(false);
  const titleId = useId();
  const dialogTitleId = useId();
  const instructionTriggerRef = useRef<HTMLButtonElement>(null);
  const closeDialogRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isInstructionsOpen) {
      return undefined;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeDialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setInstructionsOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isInstructionsOpen]);

  if (mode === "hidden" || mode === "unsupported") {
    return null;
  }

  return (
    <>
      <section className="home-install-guide" aria-labelledby={titleId}>
        <div className="home-install-guide-copy">
          <strong id={titleId}>アプリとして使う</strong>
          <p>ホーム画面に追加すると、すぐに開けます。</p>
        </div>
        <div className="button-row">
          {mode === "browserInstall" ? (
            <button type="button" className="button primary" onClick={() => void promptInstall()}>
              インストール
            </button>
          ) : (
            <button
              ref={instructionTriggerRef}
              type="button"
              className="button primary"
              onClick={() => setInstructionsOpen(true)}
            >
              インストール方法
            </button>
          )}
          <button type="button" className="button secondary" onClick={dismiss}>
            閉じる
          </button>
        </div>
      </section>

      {isInstructionsOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
            <h2 id={dialogTitleId}>iPhone・iPadでのインストール</h2>
            <ol>
              <li>ブラウザの共有メニューを開きます。</li>
              <li>「ホーム画面に追加」「Webアプリとして開く」「追加」のいずれかを選びます。</li>
            </ol>
            <div className="dialog-actions">
              <button ref={closeDialogRef} type="button" className="button primary" onClick={() => setInstructionsOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function getInitialInstallGuideMode(): InstallGuideMode {
  if (typeof window === "undefined" || isStandaloneMode() || isInstallGuideSuppressed()) {
    return "hidden";
  }
  return isIosDevice() ? "iosManual" : "unsupported";
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const displayModeStandalone = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  const safariStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return displayModeStandalone || safariStandalone;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstallGuideSuppressed(now = Date.now()): boolean {
  if (sessionDismissedUntil > now) {
    return true;
  }

  try {
    const storedUntil = Number(window.localStorage.getItem(INSTALL_GUIDE_DISMISSED_UNTIL_KEY));
    return Number.isFinite(storedUntil) && storedUntil > now;
  } catch {
    return false;
  }
}

function suppressInstallGuide(): void {
  const dismissedUntil = Date.now() + INSTALL_GUIDE_COOLDOWN_MS;
  sessionDismissedUntil = dismissedUntil;

  try {
    window.localStorage.setItem(INSTALL_GUIDE_DISMISSED_UNTIL_KEY, String(dismissedUntil));
  } catch {
    // localStorageが使えない環境では、このセッション内だけ抑制する。
  }
}

function getFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    ".pwa-install-dialog button:not([disabled]), .pwa-install-dialog [href], .pwa-install-dialog input:not([disabled]), .pwa-install-dialog select:not([disabled]), .pwa-install-dialog textarea:not([disabled])",
  ));
}
