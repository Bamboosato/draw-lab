import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useTournaments } from "../app/TournamentProvider";

export function PwaStatus() {
  const { storageStatus } = useTournaments();
  const [isOnline, setIsOnline] = useState(() => getInitialOnlineState());
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const canApplyUpdate = isOnline && storageStatus !== "saving" && !isUpdating;

  if (isOnline && !needRefresh && !updateError) {
    return null;
  }

  async function applyUpdate() {
    if (!canApplyUpdate) {
      return;
    }

    setIsUpdating(true);
    setUpdateError(false);

    try {
      await updateServiceWorker(true);
    } catch {
      setIsUpdating(false);
      setUpdateError(true);
    }
  }

  function deferUpdate() {
    setNeedRefresh(false);
    setUpdateError(false);
  }

  return (
    <section
      className={`pwa-status${!isOnline ? " offline" : ""}${needRefresh ? " update" : ""}${updateError ? " error" : ""}`}
      role={updateError ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="pwa-status-content">
        {!isOnline ? <strong>オフラインで利用中</strong> : null}
        {needRefresh ? (
          <span>
            新しいバージョンがあります。
            {storageStatus === "saving" ? "保存完了後に更新できます。" : ""}
          </span>
        ) : null}
        {isUpdating ? <span>更新しています。</span> : null}
        {updateError ? <span>更新できませんでした。再試行してください。</span> : null}
      </div>
      {needRefresh ? (
        <div className="pwa-status-actions">
          <button type="button" className="button primary" disabled={!canApplyUpdate} onClick={() => void applyUpdate()}>
            更新
          </button>
          <button type="button" className="button secondary" disabled={isUpdating} onClick={deferUpdate}>
            後で
          </button>
        </div>
      ) : null}
    </section>
  );
}

function getInitialOnlineState(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}
